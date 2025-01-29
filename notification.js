const client=require('./middlewares/dbconnection')
const axios = require('axios');
const nodemailer = require("nodemailer");
// const client = new Client({
//     connectionString: 'postgresql://your_username:your_password@localhost:5432/your_database'
// });
require('dotenv').config(); // Load environment variables from .env file
// Connect to PostgreSQL
client.connect();

// Set up Nodemailer with Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Your email
    pass: process.env.EMAIL_PASSWORD, // Your email password or app password
  },
});

// Function to send an email using Gmail
async function sendEmail(to, subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: subject,
    text: text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Listen for PostgreSQL notifications on 'reorder_notification' channel
client.query('LISTEN reorder_notification');

console.log('Listening for stock reorder notifications...');

// Handle incoming notifications
client.on('notification', async (msg) => {
  if (msg.channel === 'reorder_notification') {
    try {
      // Parse notification payload (component and reference number)
      const [component, referenceNo] = msg.payload.split('|');
      const subject = 'Reorder Alert';
      const text = `Stock is low for ${component} (Reference: ${referenceNo}).`;

      // Send an email to the specified address
      await sendEmail('safvan13473@gmail.com', subject, text); // Email address where the alert should go

      // Optionally, send a push notification (e.g., Firebase, if needed)
      await axios.post('https://fcm.googleapis.com/fcm/send', {
        to: '/topics/stock_alerts',
        notification: {
          title: `Reorder Needed: ${component}`,
          body: `Only ${text} left. Reorder level: ${referenceNo}`,
        },
      }, {
        headers: {
          'Authorization': 'Bearer YOUR_FIREBASE_SERVER_KEY', // Replace with actual key
          'Content-Type': 'application/json',
        },
      });

    } catch (error) {
      console.error('Error handling notification:', error);
    }
  }
});