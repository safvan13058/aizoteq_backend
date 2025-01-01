const express = require('express');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();
const db = require('./dbconnection');
const login = express.Router();
login.use(express.json());

const cors = require('cors');
login.use(cors({
    origin:['http://127.0.0.1:5500', 'http://172.20.10.7:5500'], // Allow all origins
    credentials: true, // Allow cookies to be sent
}));

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Your Cognito App client ID and secret
const clientId = process.env.clientId;
const clientSecret = process.env.clientSecret;

// Function to calculate the SECRET_HASH
function calculateSecretHash(username) {
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(username + clientId); // The hash is the username + clientId
    return hmac.digest('base64'); // Return the base64-encoded hash
}
const cognito = new AWS.CognitoIdentityServiceProvider({
    region: process.env.COGNITO_REGION, // Adjust to your region
});
AWS.config.update({ region: process.env.COGNITO_REGION });

// Login API
login.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const params = {
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: process.env.clientId,
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            SECRET_HASH: calculateSecretHash(username),
        },
    };

    try {
        const response = await cognito.initiateAuth(params).promise();
        const token = response.AuthenticationResult.IdToken;
        // console.log(token)

        // Decode the JWT
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.sub) {
            return res.status(400).json({ message: 'Invalid token: Missing `sub` claim' });
        }

        const jwtsub = decoded.sub;
        // console.log(jwtsub)
        // console.log("working")
        // Query the database to check if `jwtsub` exists
        const query = 'SELECT * FROM Users WHERE jwtsub = $1';
        const { rows } = await db.query(query, [jwtsub]);

        if (rows.length === 0) {

            return res.status(404).json({ message: 'User not found for the provided sub' });
        }
        // Optionally log or process the user details
        console.log('User details:', rows[0]);
        res.set('JWT-Sub', jwtsub);
        res.set('Authorization', `Bearer ${token}`);
        // console.log('User details:');
        
        // Generate a custom JWT if needed
        // const customToken = jwt.sign({ username, sub: jwtsub }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ message: 'Login successful',token,jwtsub,user: rows[0]});
    } catch (err) {
        res.status(500).json({ message: 'Error during login', error: err.message });
    }
});

// Logout API
login.post('/logout', async (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
        return res.status(400).json({ message: 'Missing required field: accessToken' });
    }

    const params = {
        AccessToken: accessToken,
    };

    try {
        await cognito.globalSignOut(params).promise();
        res.status(200).json({ message: 'Logout successful' });
    } catch (err) {
        res.status(500).json({ message: 'Error during logout', error: err.message });
    }
});

module.exports = login;
