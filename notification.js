require('dotenv').config(); // Load environment variables
const { Client } = require('pg'); // PostgreSQL client
const fs = require('fs');
const nodemailer = require("nodemailer");
const admin = require('firebase-admin');
const db =require('./middlewares/dbconnection')
// Initialize Firebase Admin SDK

const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/your-client-email%40your-project-id.iam.gserviceaccount.com"
  };
  
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
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
// async function sendPushNotification(title, body) {
//   try {
//     const message = {
//       topic: "stock_alerts", // Topic-based notification
//       notification: { title, body },
//     };
//     const response = await admin.messaging().send(message);
//     console.log("📱 Push notification sent:", response);
//   } catch (error) {
//     console.error("Error sending push notification:", error);
//   }
// }
// Function to send push notification via Firebase and store in DB
async function sendPushNotification(title, body, topic = "stock_alerts") {
  try {
    const message = {
      topic, // Store the topic dynamically
      notification: { title, body },
    };
    const response = await admin.messaging().send(message);
    console.log("📱 Push notification sent:", response);

    // Store in database with topic
    await storeNotification(title, body, topic);
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}
// Function to store notification in the database
async function storeNotification(title, body, topic = "stock_alerts") {
  try {
    const query = "INSERT INTO alert_notifications (title, body, topic) VALUES ($1, $2, $3)";
    await db.query(query, [title, body, topic]);
    console.log("📄 Notification stored in DB");
  } catch (error) {
    console.error("❌ Error storing notification:", error);
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
