const express = require('express');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const login = express.Router();
login.use(express.json());


const cors = require('cors');
login.use(cors({
    origin: 'http://127.0.0.1:5500', // Replace with the origin of your client app
    credentials: true, // Allow cookies to be sent
}));
AWS.config.update({
    accessKeyId: "AKIAXGZAMMMAPTC2P6EV",
    secretAccessKey:"sESVZGDHkFitFZF1JBOfYhiT9ZlJIro8HJXb+QjR",
    region: "ap-south-1",
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
        console.log("working")
        const response = await cognito.initiateAuth(params).promise();
        console.log("working")
        const token = response.AuthenticationResult.IdToken;

        // Generate a custom JWT if needed
        const customToken = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Login successful', token, customToken });
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
