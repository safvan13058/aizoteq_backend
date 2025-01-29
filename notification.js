require('dotenv').config(); // Load environment variables
const { Client } = require('pg'); // PostgreSQL client
const fs = require('fs');
const nodemailer = require("nodemailer");
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// const serviceAccount = require('./certificate/aizoteq-c0002-cd5bca74ffa4.json'); // Replace with your Firebase JSON file
admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync('./certificate/aizoteq-c0002-cd5bca74ffa4.json')))
  });

// Configure PostgreSQL client for LISTEN/NOTIFY
const client = new Client({
    host: 'database-1.cdiqmk28wk12.ap-south-1.rds.amazonaws.com', // AWS RDS
    user: 'postgres',                      // Your database username
    password: 'Aizo12345',                 // Your database password
    database: 'postgres',                  // Your database name
    port: 5432,                            // Default PostgreSQL port
    ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync('global-bundle.pem').toString() // RDS SSL Cert
    }
});

// Connect to PostgreSQL
client.connect().then(() => {
    console.log("Connected to PostgreSQL!");
}).catch(err => console.error("PostgreSQL Connection Error:", err));

// Set up Nodemailer with Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASSWORD, 
  },
});

// Function to send an email
async function sendEmail(to, subject, text) {
  try {
    const mailOptions = { from: process.env.EMAIL_USER, to, subject, text };
    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', info.response);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Function to send push notification via Firebase
async function sendPushNotification(title, body) {
  try {
    const message = {
      topic: "stock_alerts", // Topic-based notification
      notification: { title, body },
    };
    const response = await admin.messaging().send(message);
    console.log("📱 Push notification sent:", response);
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}



// Listen for PostgreSQL notifications
client.query('LISTEN reorder_notification');
console.log("📡 Listening for stock reorder notifications...");

client.on("notification", async (msg) => {
  if (msg.channel === "reorder_notification") {
    try {
      console.log(`🔔 Notification received: ${msg.payload}`);
      
      // Parse the payload (e.g., "Component|123")
      const [component, referenceNo] = msg.payload.split("|");
      const subject = "Reorder Alert";
      const text = `Stock is low for ${component} (Reference: ${referenceNo}).`;

      // Send email alert
      await sendEmail("safvan13473@gmail.com", subject, text);

      // Send push notification
      await sendPushNotification(`Reorder Needed: ${component}`, text);

    } catch (error) {
      console.error("Error handling notification:", error);
    }
  }
});
