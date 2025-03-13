const express = require('express');
const app = express();
app.use(express.json());
const db = require('./middlewares/dbconnection');
const path=require('path');
const login = require('./login');
const signup=require('./signup');
const testapp=require('./testapp.js');
const homeapp=require('./homeapp.js');
const dashboard=require('./dashboard/dashboard.js')

const notification=require('./notification.js')
const mqttClient = require("./MQTT/mqtt.js"); // Importing mqtt.js initializes MQTT functionality
require("dotenv").config();

app.use('/',testapp)
app.use('/',homeapp)
app.use('/signup',signup);
app.use('/signup',login);
app.use('/dashboard',dashboard);

// Serve static files (important for service workers & Firebase SDK)
app.use(express.static(path.join(__dirname, 'notifications')));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the HTML file
app.get('/notification', (req, res) => {
    res.sendFile(path.join(__dirname,'notify.html'));
});
app.get('/firebase-messaging-sw.js', (req, res) => {
    res.sendFile(path.join(__dirname,'firebase-messaging-sw.js'));
});

app.get('/',(req,res)=>{
    res.send('working EC2 ')
});

app.get('/dash',(req,res)=>{
    res.send('dash EC2 ')
});
const cors = require('cors');
// app.use(cors({
//     origin:['http://127.0.0.1:5500', 'http://172.20.10.7:5500','http://localhost:3000','https://demo.ollinwon.com','https://auslandenglish.com','https://auslandenglish.com:3000'], // Allow all origins
//     credentials: true, // Allow cookies to be sent
// }));



app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const allowedOrigins = ['https://demo.ollinwon.com', 'https://iot.aizoteq.com','https://aizoteq.com','http://localhost:3000',"http://127.0.0.1:5500","http://localhost:5500"];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies and credentials
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Optional: Manually handle OPTIONS preflight requests
app.options('*', cors(corsOptions)); // Allow preflight for all routes

// Example route
app.get('/api/test', (req, res) => {
    res.json({ message: 'CORS is working!' });
});

app.use((req, res, next) => {
    console.log(req.headers.origin)
    const origin = req.headers.origin; // Get the origin of the incoming request
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin); // Dynamically set the allowed origin
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // Allow cookies and credentials
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Specify allowed HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Specify allowed headers

    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Handle preflight requests
    }
    next();
});

// app.use((req, res, next) => {
//     res.setHeader('Access-Control-Allow-Origin', 'https://demo.ollinwon.com'); // Allow only the specified origin
//     res.setHeader('Access-Control-Allow-Credentials', 'true'); // Allow cookies and credentials
//     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Specify allowed HTTP methods
//     res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Specify allowed headers
//     if (req.method === 'OPTIONS') {
//         return res.status(200).end(); // Handle preflight requests
//     }
//     next();
// });

const { swaggerUi, specs } = require("./swaggerdoc/swagger.js");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

const fs = require('fs');
const http = require('http');
const https = require('https');
const PORT_HTTPS = 3000; // HTTPS port
const PORT_HTTP = 3001;  // HTTP port

let isHttpsAvailable = false;

try { 
    // Try loading SSL certificates
    // const options = {
    //     key: fs.readFileSync('/etc/letsencrypt/live/auslandenglish.com/privkey.pem'),
    //     cert: fs.readFileSync('/etc/letsencrypt/live/auslandenglish.com/fullchain.pem'),
    // };
    const options = {
        key: fs.readFileSync('/etc/letsencrypt/live/admin.aizoteq.com/privkey.pem'),
        cert: fs.readFileSync('/etc/letsencrypt/live/admin.aizoteq.com/fullchain.pem'),
    };

    // If SSL certificates are available, start the HTTPS server
    https.createServer(options, app).listen(PORT_HTTPS, () => {
        isHttpsAvailable = true;
        console.log(`HTTPS Server is running on https://13.200.215.17:${PORT_HTTPS}`);
    });
} catch (error) {
    console.error('HTTPS setup failed:', error.message);
    console.log('HTTPS is unavailable, starting HTTP...');
}

// If HTTPS is not available, fallback to HTTP
if (!isHttpsAvailable) {
    // Start HTTP server
    http.createServer(app).listen(PORT_HTTP, () => {
        console.log(`HTTP Server is running on http://13.200.215.17:${PORT_HTTP}`);
    });
} else {
    // If HTTPS is available, redirect HTTP traffic to HTTPS
    http.createServer((req, res) => {
        res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
        res.end();
    }).listen(PORT_HTTP, () => {
        console.log(`HTTP Server is redirecting traffic to HTTPS on http://13.200.215.17:${PORT_HTTP}`);
    });
}


// app.listen(PORT,
//     '0.0.0.0',
//      () => {
//     console.log(`Server running on port ${PORT}`);
// });
