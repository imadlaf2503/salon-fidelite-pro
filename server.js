const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const SCAN_PASS = "COIFFEUR2026";

// Connexion MongoDB
const MONGO_URI = "mongodb+srv://admin:Abdellah252003@cluster0.pjco9tv.mongodb.net/salonDB?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB Cloud"))
  .catch(err => console.error("❌ Erreur de connexion Mongo :", err));

const ClientSchema = new mongoose.Schema({
    nom: String,
    points: { type: Number, default: 0 }
});
const Client = mongoose.model('Client', ClientSchema);

function render(viewName, variables = {}) {
    let template = fs.readFileSync(path.join(__dirname, 'views', viewName), 'utf8');
    Object.keys(variables).forEach(key => {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
    });
    return template;
}

// --- ROUTES ---

app.get('/', async (req, res) => {
    try {
        const clients = await Client.find();
        let tableRows = "";
        clients.forEach(c => {
            tableRows += `<tr>
                <td>${c.nom}</td>
                <td>${c.points}</td>
                <td><a href="/ma-carte/${c._id}" target="_blank">Voir Carte</a></td>
            </tr>`;
        });
        res.send(render('dashboard.html', { tableRows }));
    } catch (e) { res.status(500).send("Erreur"); }
});

app.get('/inscription', (req, res) => {
    res.send(render('inscription.html'));
});

app.post('/inscription-client', async (req, res) => {
    try {
        const nouveauClient = new Client({ nom: req.body.nom, points: 0 });
        await nouveauClient.save();
        // Redirige vers la carte avec un paramètre spécial ?install=true
        res.redirect(`/ma-carte/${nouveauClient._id}?install=true`);
    } catch (e) { res.status(500).send("Erreur"); }
});

app.get('/ma-carte/:id', async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).send("Inexistant");
        const qrImage = await QRCode.toDataURL(req.params.id);
        res.send(render('carte.html', {
            id: req.params.id,
            nom: client.nom,
            points: client.points,
            qrCode: qrImage,
            salon_name: "IMAD COIFFURE"
        }));
    } catch (e) { res.status(404).send("Lien invalide"); }
});

app.get('/scanner', (req, res) => {
    if (req.query.pass !== SCAN_PASS) return res.send("Accès refusé");
    res.send(render('scanner.html', { pass: SCAN_PASS }));
});

app.post('/scan-api', async (req, res) => {
    if (req.body.pass !== SCAN_PASS) return res.json({ success: false });
    try {
        const client = await Client.findByIdAndUpdate(req.body.qrCodeId, { $inc: { points: 1 } }, { new: true });
        if (client) {
            io.to(req.body.qrCodeId).emit('point-added', { newPoints: client.points });
            res.json({ success: true });
        } else { res.json({ success: false }); }
    } catch (e) { res.json({ success: false }); }
});

io.on('connection', (socket) => {
    socket.on('join-client-room', (id) => socket.join(id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Système prêt sur le port ${PORT}`));