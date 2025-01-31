const express=require('express');
const signup=express.Router();
const db = require('./middlewares/dbconnection');
const AWS=require('aws-sdk');
require('dotenv').config();
signup.use(express.json());
const crypto = require('crypto');


const session = require('express-session');
// Configure session middleware
signup.use(session({
    secret: "ffbd7c1dbf8ccc6d000658acfa9bc8be68086f710177e0fa0802d4f6f5579805", // Use a strong, secure secret
    resave: false,
    saveUninitialized: true,
    // cookie: { secure: false,maxAge: 24 * 60 * 60 * 1000, sameSite: 'None'}, // For production, set `secure: true` with HTTPS
    // Allow cross-origin cookies
    // domian: "127.0.0.1"

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



async function handleSignup(req, res, role) {
    const { userName, password, email, phoneNumber, fullName } = req.body;
    console.log(`signup${userName, password, email, phoneNumber, fullName}`)
    const secretHash = calculateSecretHash(userName);

    if (!userName || !password || !email) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    console.log(process.env.clientId)
    console.log('AWS Region:', process.env.COGNITO_REGION);
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
        console.log(userName, password, email, phoneNumber, fullName)
        // Sign up the user in Cognito
        const signUpResponse = await cognito.signUp(params).promise();
        const jwtsub = signUpResponse.UserSub; // The unique identifier for the user in Cognito
        
       
        // Insert user details into PostgreSQL database
        // const query = 'INSERT INTO Users (userName, jwtsub, userRole,name) VALUES ($1, $2, $3,$4)';
        // const values = [userName, jwtsub, role,fullName];

        // await db.query(query, values);

        req.session.username = userName; // Store username in session
        
   
        console.log(req.session.username)
        console.log(req.session)
        console.log(req.session)

        req.session.jwtsub =jwtsub;
        req.session.role =role;
        res.status(201).json({ 
            message: 'User signed up successfully',
            userSub: jwtsub,
            role:role,
           
        });
    } catch (err) {
        console.error('Cognito sign-up error:', err.message, err.code);
        res.status(500).json({ message: 'Error during Cognito sign-up', error: err.message });
    }
}

const cors = require('cors');
signup.use(cors({
    origin:['http://127.0.0.1:5500', 'http://172.20.10.7:5500'], // Allow all origins
    credentials: true, // Allow cookies to be sent
}));
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

// Route to set a session value
signup.get('/set-session', (req, res) => {
    req.session.user = "safvan"; // Store the username in session
    res.json({ message: 'Session data set successfully', username: req.session.user ,session:req.session});
  });

  // Route to get session data
signup.get('/get-session', (req, res) => {
    if (req.session.user) {
      res.json({ message: `Welcome back, ${req.session.user}` });
    } else {
      res.json({ message: 'No session data available' });
    }
  });

// Verify OTP using only the OTP code
// Verify OTP API
signup.post('/verify-otp', async (req, res) => {
    const {username, otp, fullName, jwtsub, role } = req.body;
    console.log(`otp${req.body}`)
    console.log(`get otp${otp}`)
    console.log(req.session.username)
    console.log(req.session)
    

    if (!username|| !otp) {
        return res.status(400).json({ message: 'Missing required fields: username and otp are required' });
    }
    // const username = req.session.username;
    const params = {
        ClientId: process.env.clientId,
        Username: username,
        ConfirmationCode: otp,
        SecretHash: calculateSecretHash(username),
    };

    try {
        console.log("working")
        await cognito.confirmSignUp(params).promise();
        const query = 'INSERT INTO Users (userName, jwtsub, userRole,name) VALUES ($1, $2,$3,$4)';
        const values = [username, jwtsub||req.session.jwtsub, role||req.session.role,fullName];

        await db.query(query, values);
        console.log("workings")
        req.session.destroy();
        res.status(200).json({ message: 'OTP verified successfully' });
        console.log('OTP verified successfully' )
    } catch (err) {
        if (err.code === 'CodeMismatchException') {
            return res.status(400).json({ message: 'Invalid OTP' });
        }
        if (err.code === 'ExpiredCodeException') {
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }
        res.status(500).json({ message: 'Error during OTP verification', error: err.message });
    }
});

const rateLimit = require('express-rate-limit');
// Rate limiter for Resend OTP
const resendOtpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // Limit each IP to 3 requests per window
    message: 'Too many requests, please try again later.',
});

// Resend OTP API
signup.post('/resend-otp', resendOtpLimiter, async (req, res) => {
    // const username = req.session.username;
    const {username }= req.body||req.session.username;
    if (!username) {
        return res.status(400).json({ message: 'Missing required field: username' });
    }

    const params = {
        ClientId: process.env.clientId,
        Username: username,
        SecretHash: calculateSecretHash(username),
    };

    try {
        await cognito.resendConfirmationCode(params).promise();
        res.status(200).json({ message: 'OTP resent successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error during OTP resend', error: err.message });
    }

});


module.exports = signup;

