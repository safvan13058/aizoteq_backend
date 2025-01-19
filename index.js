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


const { swaggerUi, specs } = require("./swaggerdoc/swagger.js");
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

const fs = require('fs');
const https = require('https');
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/auslandenglish.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/auslandenglish.com/fullchain.pem'),
};
const PORT = process.env.PORT || 3000;
https.createServer(options, app).listen(3000, () => {
    console.log('Server is running on https://13.200.215.17:3000');
});
// app.listen(PORT,
//     '0.0.0.0',
//      () => {
//     console.log(`Server running on port ${PORT}`);
// });
