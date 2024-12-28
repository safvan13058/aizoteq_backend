const express = require('express');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const login = express.Router();
login.use(express.json());

// AWS Cognito configuration
const cognito = new AWS.CognitoIdentityServiceProvider({
    region: process.env.COGNITO_REGION,
});

// Function to calculate SECRET_HASH
function calculateSecretHash(username) {
    const hmac = crypto.createHmac('sha256', process.env.CLIENT_SECRET);
    hmac.update(username + process.env.clientId);
    return hmac.digest('base64');
}

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
