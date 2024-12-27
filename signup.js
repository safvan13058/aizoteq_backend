const express=require('express');
const signup=express.Router();
const db = require('./dbconnection');
const AWS=require('aws-sdk');
require('dotenv').config();
signup.use(express.json());
const crypto = require('crypto');

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



async function handleSignup(req, res, role) {
    const { userName, password, email, phoneNumber, fullName } = req.body;
    const secretHash = calculateSecretHash(userName);

    if (!userName || !password || !email) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const params = {
        ClientId: process.env.clientId,
        Username: userName,
        Password: password,
        UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'given_name', Value: userName },
            { Name: 'phone_number', Value: phoneNumber },
            { Name: 'name', Value: fullName },
        ],
        SecretHash: secretHash,
    };

    try {
        // Sign up the user in Cognito
        const signUpResponse = await cognito.signUp(params).promise();
        const jwtsub = signUpResponse.UserSub; // The unique identifier for the user in Cognito

        // Insert user details into PostgreSQL database
        const query = 'INSERT INTO Users (id, userName, jwtsub, userRole) VALUES ($1, $2, $3, $4)';
        const values = [jwtsub, userName, jwtsub, role];

        await db.query(query, values);

        res.status(201).json({
            message: 'User signed up successfully',
            userSub: jwtsub,
        });
    } catch (err) {
        res.status(500).json({ message: 'Error during Cognito sign-up', error: err.message });
    }
}

// Customer sign-up
signup.post('/app/customer/signup', async (req, res) => {
    await handleSignup(req, res, 'customer');
});

// Staff sign-up
signup.post('/app/staff/signup', async (req, res) => {
    await handleSignup(req, res, 'staff');
});

// Admin sign-up
signup.post('/dashboard/admin/signup', async (req, res) => {
    await handleSignup(req, res, 'admin');
});

// Dealer sign-up
signup.post('/dashboard/dealer/signup', async (req, res) => {
    await handleSignup(req, res, 'dealer');
});




module.exports = signup;

