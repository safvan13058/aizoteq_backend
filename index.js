const express = require('express');
const app = express();
app.use(express.json());
const db = require('./middlewares/dbconnection');

const login = require('./login');
const signup=require('./signup');
const testapp=require('./testapp.js');
const homeapp=require('./homeapp.js');
const dashboard=require('./dashboard/dashboard.js')


app.use('/',testapp)
app.use('/',homeapp)
app.use('/signup',signup);
app.use('/signup',login);
app.use('/dashboard',dashboard);




app.get('/',(req,res)=>{
    res.send('working EC2 ')
});

app.get('/dash',(req,res)=>{
    res.send('dash EC2 ')
});
const cors = require('cors');
app.use(cors({
    origin:['http://127.0.0.1:5500', 'http://172.20.10.7:5500','http://localhost:3000','https://demo.ollinwon.com','https://auslandenglish.com','https://auslandenglish.com:3000'], // Allow all origins
    credentials: true, // Allow cookies to be sent
}));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://demo.ollinwon.com'); // Allow only the specified origin
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // Allow cookies and credentials
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Specify allowed HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Specify allowed headers
    if (req.method === 'OPTIONS') {
        return res.status(200).end(); // Handle preflight requests
    }
    next();
});

const { swaggerUi, specs } = require("./swaggerdoc/swagger.js");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

const fs = require('fs');
const http = require('http');
const https = require('https');
const PORT = 3000;

let isHttpsEnabled = false;

try {
    // Attempt to load SSL certificates
    const options = {
        key: fs.readFileSync('/etc/letsencrypt/live/auslandenglish.com/privkey.pem'),
        cert: fs.readFileSync('/etc/letsencrypt/live/auslandenglish.com/fullchain.pem'),
    };

    // Start HTTPS server
    https.createServer(options, app).listen(PORT, () => {
        isHttpsEnabled = true;
        console.log(`HTTPS Server is running on https://13.200.215.17:${PORT}`);
    });
} catch (error) {
    console.error('HTTPS setup failed. Falling back to HTTP:', error.message);
}

// Start HTTP server
http.createServer((req, res) => {
    if (isHttpsEnabled) {
        // Redirect to HTTPS if HTTPS is working
        res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
        res.end();
    } else {
        // Serve the app over HTTP if HTTPS is not available
        app(req, res);
    }
}).listen(PORT, () => {
    if (!isHttpsEnabled) {
        console.log(`HTTP Server is running on http://13.200.215.17:${PORT}`);
    }
});

// app.listen(PORT,
//     '0.0.0.0',
//      () => {
//     console.log(`Server running on port ${PORT}`);
// });
