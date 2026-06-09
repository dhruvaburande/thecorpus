const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const port = 3000;

// Replace this with your actual Google Client ID
const CLIENT_ID = '1068173814955-k1f7da3lna43uc7pm59m3hfec0153srm.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

app.use(cors());
app.use(bodyParser.json());

// In-memory user "database" for this example
let users = {};

app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const userid = payload['sub'];
        const email = payload['email'];
        const name = payload['name'];
        const picture = payload['picture'];

        // You can save or update the user in your database here
        users[userid] = {
            email,
            name,
            picture,
            lastLogin: new Date()
        };

        console.log(`User ${name} (${email}) signed in.`);

        res.status(200).json({
            message: 'Authentication successful',
            user: {
                id: userid,
                name,
                email,
                picture
            }
        });
    } catch (error) {
        console.error('Error verifying Google token:', error);
        res.status(401).json({ message: 'Invalid token' });
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});
