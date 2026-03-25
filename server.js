const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const SCAN_PASS = "COIFFEUR2026";

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DATA_DIR = path.join(__dirname, 'data');

// Fonction pour s'assurer que la BDD existe
const initializeDB = () => {
    // 1. Créer le dossier 'data' s'il n'existe pas
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
        console.log("📁 Dossier /data créé");
    }
    // 2. Créer le fichier 'db.json' s'il n'existe pas
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
        console.log("📄 Fichier db.json initialisé");
    }
};

// Appeler l'initialisation AVANT de lancer le serveur
initializeDB();


// Helper pour charger/sauvegarder la BDD
const getClients = () => JSON.parse(fs.readFileSync(DB_PATH));
const saveClients = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// Moteur de rendu ultra-simple
function render(viewName, variables = {}) {
    let template = fs.readFileSync(path.join(__dirname, 'views', viewName), 'utf8');
    Object.keys(variables).forEach(key => {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
    });
    return template;
}

// --- ROUTES ---

// Accueil (Dashboard)
app.get('/', (req, res) => {
    const clients = getClients();
    let tableRows = "";
    Object.keys(clients).forEach(id => {
        tableRows += `<tr>
            <td>${clients[id].nom}</td>
            <td>${clients[id].points}</td>
            <td><a href="/ma-carte/${id}" target="_blank">Voir Carte</a></td>
        </tr>`;
    });
    res.send(render('dashboard.html', { tableRows }));
});

// La Carte Client
app.get('/ma-carte/:id', async (req, res) => {
    const clients = getClients();
    const client = clients[req.params.id];
    if (!client) return res.status(404).send("Client inexistant");
    
    const qrImage = await QRCode.toDataURL(req.params.id);
    res.send(render('carte.html', {
        id: req.params.id,
        nom: client.nom,
        points: client.points,
        qrCode: qrImage,
        salon_name: "IMAD COIFFURE"
    }));
});

// Le Scanner
app.get('/scanner', (req, res) => {
    if (req.query.pass !== SCAN_PASS) return res.send("Accès refusé");
    res.send(render('scanner.html', { pass: SCAN_PASS }));
});

// API : Création Client
app.post('/create-card-web', (req, res) => {
    const clients = getClients();
    const id = uuidv4();
    clients[id] = { nom: req.body.nom, points: 0 };
    saveClients(clients);
    res.redirect('/');
});

// API : Scan (Ajout de point)
app.post('/scan-api', (req, res) => {
    if (req.body.pass !== SCAN_PASS) return res.json({ success: false });
    const clients = getClients();
    const id = req.body.qrCodeId;
    if (clients[id]) {
        clients[id].points += 1;
        saveClients(clients);
        io.to(id).emit('point-added', { newPoints: clients[id].points });
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Socket.io
io.on('connection', (socket) => {
    socket.on('join-client-room', (id) => socket.join(id));
});

server.listen(3000, () => console.log("🚀 Système prêt sur http://localhost:3000"));