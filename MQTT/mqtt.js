const mqtt = require("mqtt");
const db = require("../middlewares/dbconnection");
require("dotenv").config(); // For environment variables
const AWS = require("aws-sdk");

// MQTT Broker Connection
const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com";

console.log("mqtt page working")
const fs = require("fs");

const client = mqtt.connect("mqtts://an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com", {
  port: 8883,
  clientId: "test-client-" + Math.random().toString(16).substr(2, 8),
  key: fs.readFileSync("certificate/63211473333aba881532e2ff88093a2ea78dea687fa519bdf78b2dc787e6972b-private.pem.key"),
  cert: fs.readFileSync("certificate/63211473333aba881532e2ff88093a2ea78dea687fa519bdf78b2dc787e6972b-certificate.pem.crt"),
  ca: fs.readFileSync("certificate/AmazonRootCA1 (1).pem"),
  debug: true, // Enable MQTT debugging
});
client.on("connect", () => {
  console.log("Connected to AWS IoT Core via MQTTS");
});

client.on("error", (err) => {
  console.error("MQTT connection error:", err.message);
});

client.on("offline", () => {
  console.log("MQTT client went offline");
});

client.on("close", () => {
  console.log("MQTT connection closed");
});

// AWS IoT Configuration
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID2,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY2,
  region: "ap-south-1", // Adjust to your region
});
const iotData = new AWS.IotData({
  endpoint: "an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com", // Replace with your IoT endpoint
});
client.on("connect", () => {
  console.log("Connected to MQTT broker");

  // Subscribe to shadow update topic
  client.subscribe("$aws/things/84F703B5F560/shadow/update/accepted", { qos: 1 }, (err) => {
    if (err) {
      console.error("Subscription error:", err);
    } else {
      console.log("Subscribed to device shadow updates");
    }
  });
});
function handleDeviceStatus(deviceId, status) {
  const timestamp = new Date(); // Capture current timestamp
  const query = `
    INSERT INTO audit_logs (thing_mac, action, event_data, timestamp)
    VALUES ($1, $2, $3, $4)
  `;
  
  const eventData = {
    status, // Full status message (e.g., switch statuses)
  };
  console.log(`events===${eventData}`)
  console.log(`events===${JSON.stringify(eventData, null, 2)}`)
  db.query(
    query,
    [deviceId, "status_update", JSON.stringify(eventData), timestamp],
    (err) => {
      if (err) {
        console.error("Device status logging error:", err);
      } else {
        console.log(`Status logged for device ${deviceId} at ${timestamp}`);
      }
    }
  );
}
client.on("message", (topic, message) => {
  // console.log(`Message received on ${topic}: ${message.toString()}`);

  if (topic === "$aws/things/84F703B5F560/shadow/update/accepted") {
    try {
      // const deviceId = topic.split("/")[2];
      const payload = JSON.parse(message.toString());
      const status = payload.state || {};

      // Ensure deviceInfo exists before accessing
      const deviceId = status.desired?.id || topic.split("/")[2];
      
      console.log(`device_id===${topic.split("/")[2]}`)
      console.log(`data======${JSON.stringify(status, null, 2)}`);
      if (status.deviceInfo && Array.isArray(status.deviceInfo) && status.deviceInfo.length > 10) {
        deviceId = status.deviceInfo[10] || "Unknown"; // Adjust index if needed
      }

      console.log(`Extracted Device ID: ${deviceId}`);
      handleDeviceStatus(deviceId, status);
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  } else {
    console.warn("Unhandled topic type:", topic);
  }
});


process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
// Graceful Shutdown
process.on("SIGINT", () => {
  console.log("Disconnecting MQTT client...");
  client.end();
  console.log("MQTT client disconnected.");

  console.log("Closing database connection...");
  db.end((err) => {
    if (err) {
      console.error("Error closing database connection:", err);
    } else {
      console.log("Database connection closed.");
    }
    process.exit(0);
  });
});


module.exports = client;
