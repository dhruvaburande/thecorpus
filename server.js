// === GOOGLE SIGN-IN BACKEND ===
// Run with: node server.js
// Frontend expects this on port 3000 by default.

const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// REPLACE WITH YOUR CLIENT ID
const CLIENT_ID = '766198434917-afp4sa1nq6f5otme8cc5rmttfdiagiu3.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8080', 'http://localhost:3001', '*'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(bodyParser.json());

// Path to our "database" file
const DB_FILE = path.join(__dirname, 'db.json');

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, comments: [] }, null, 2));
}

// Helper to read/write DB
const readDB = () => JSON.parse(fs.readFileSync(DB_FILE));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- AUTHENTICATION ---
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const googleId = payload['sub'];

        const db = readDB();
        // If user is new, initialize their data
        if (!db.users[googleId]) {
            db.users[googleId] = {
                id: googleId,
                name: payload['name'],
                email: payload['email'],
                picture: payload['picture'],
                likes: []
            };
            saveDB(db);
        }

        res.status(200).json({
            message: 'Auth success',
            user: db.users[googleId]
        });
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
});

// --- LIKES SYSTEM ---
app.post('/api/like', (req, res) => {
    const { googleId, poemId } = req.body;
    const db = readDB();

    if (!db.users[googleId]) return res.status(404).send('User not found');

    const likes = db.users[googleId].likes;
    const index = likes.indexOf(poemId);

    if (index > -1) {
        likes.splice(index, 1); // Unlike
    } else {
        likes.push(poemId); // Like
    }

    saveDB(db);
    res.json({ likes });
});

// --- COMMENTS SYSTEM ---
app.get('/api/comments', (req, res) => {
    const db = readDB();
    res.json(db.comments);
});

app.post('/api/comments', (req, res) => {
    const { googleId, userName, userPicture, text } = req.body;
    if (!text) return res.status(400).send('Empty comment');

    const db = readDB();
    const newComment = {
        id: Date.now(),
        googleId,
        userName,
        userPicture,
        text,
        date: new Date().toISOString()
    };

    db.comments.unshift(newComment); // Add to start of list
    saveDB(db);
    res.json(newComment);
});

app.listen(port, () => {
    console.log(`✅ Anthology Backend running at http://localhost:${port}`);
    console.log(`   → Make sure your frontend (index.html) is also open.`);
    console.log(`   → Google Sign-In should now work.`);
});
