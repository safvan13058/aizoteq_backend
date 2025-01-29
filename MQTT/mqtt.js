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

async function getAuditLogs(deviceId) {
  try {
    const query = `
      SELECT event_data, timestamp
      FROM audit_logs
      WHERE thing_mac = $1
      ORDER BY timestamp ASC;
    `;

    const res = await db.query(query, [deviceId]);

    let switchLogs = {};

    res.rows.forEach((row) => {
      const eventData = JSON.parse(row.event_data);
      const timestamp = new Date(row.timestamp).toLocaleTimeString();

      if (eventData.status?.desired) {
        Object.entries(eventData.status.desired).forEach(([key, value]) => {
          if (key.startsWith("s") && key.length === 2) {
            const switchNumber = key.substring(1);
            const switchState = value === "1" ? "ON" : "OFF";

            if (!switchLogs[switchNumber]) {
              switchLogs[switchNumber] = [];
            }

            switchLogs[switchNumber].push({ state: switchState, time: timestamp });
          }
        });
      }
    });

    console.log("\nSwitch Status History:\n");
    console.log("Switch | Status | Time");
    console.log("-------------------------");

    Object.entries(switchLogs).forEach(([switchNum, logs]) => {
      logs.forEach((log) => {
        console.log(`   ${switchNum}   |  ${log.state}  |  ${log.time}`);
      });
    });
  } catch (err) {
    console.error("Database query error:", err);
  }
}

const processedMessages = new Set(); // Cache to store processed messages

function handleDeviceStatus(deviceId, status) {
  const timestamp = new Date();
  const eventData = JSON.stringify({ status });

  // Create a unique key for deduplication (deviceId + event data + timestamp minute)
  const uniqueKey = `${deviceId}-${eventData}-${timestamp.getMinutes()}`;

  // Prevent duplicate insertions
  if (processedMessages.has(uniqueKey)) {
    console.log(`Skipping duplicate entry for device ${deviceId}`);
    return;
  }

  processedMessages.add(uniqueKey); // Mark message as processed

  const query = `
    INSERT INTO audit_logs (thing_mac, action, event_data, timestamp)
    VALUES ($1, $2, $3, $4)
  `;

  console.log(`Logging status for device ${deviceId}`);
  console.log(`eventData===${eventData}`)
  db.query(query, [deviceId, "status_update", eventData, timestamp], (err) => {
    if (err) {
      console.error("Device status logging error:", err);
    } else {
      console.log(`Status logged for device ${deviceId} at ${timestamp}`);
    }
  });

  // Clear cache periodically to avoid memory issues (every 5 mins)
  setTimeout(() => processedMessages.delete(uniqueKey), 300000);
}

client.on("message", (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const status = payload.state || {};
    const deviceId = status.desired?.id || topic.split("/")[2];

    console.log(`Received data for device ${deviceId}`);
    handleDeviceStatus(deviceId, status);
  } catch (error) {
    console.error("Error parsing message:", error);
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
