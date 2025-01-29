const client=require('./middlewares/dbconnection')
const axios = require('axios');
const nodemailer = require("nodemailer");
// const client = new Client({
//     connectionString: 'postgresql://your_username:your_password@localhost:5432/your_database'
// });

client.connect();

// Listen for PostgreSQL notifications
// client.query('LISTEN stock_reorder_channel');

// client.on('notification', async (msg) => {
//     const data = JSON.parse(msg.payload);
//     console.log('Stock reorder alert received:', data);

//     // Send a push notification (e.g., Firebase)
//     await axios.post('https://fcm.googleapis.com/fcm/send', {
//         to: '/topics/stock_alerts',
//         notification: {
//             title: `Reorder Needed: ${data.component}`,
//             body: `Only ${data.stock_quantity} left. Reorder level: ${data.reorder_level}`,
//         }
//     }, {
//         headers: {
//             'Authorization': 'Bearer YOUR_FIREBASE_SERVER_KEY',
//             'Content-Type': 'application/json'
//         }
//     });
// });

// console.log('Listening for stock reorder notifications...');

// Set up Nodemailer with Gmail
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASSWORD, // Your email password
    },
  });

// Function to send an email using Gmail
function sendEmail(to, subject, text) {
    const mailOptions = {
        from:  process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}

// Listen for PostgreSQL notifications
client.on('notification', (msg) => {
    if (msg.channel === 'reorder_notification') {
        const [component, referenceNo] = msg.payload.split('|');
        const subject = 'Reorder Alert';
        const text = `Stock is low for ${component} (Reference: ${referenceNo}).`;
        sendEmail('safvan13473@gmail.com', subject, text); // Send email to your address
    }
});