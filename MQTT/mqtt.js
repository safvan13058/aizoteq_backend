const mqtt = require("mqtt");
const db = require("../middlewares/dbconnection");
require("dotenv").config(); // For environment variables
const AWS = require("aws-sdk");

// MQTT Broker Connection
const brokerUrl = process.env.MQTT_BROKER_URL || "mqtts://an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com";

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
  client.subscribe("$aws/things/+/shadow/update/accepted", { qos: 1 }, (err) => {
    if (err) {
      console.error("Subscription error:", err);
    } else {
      console.log("Subscribed to device shadow updates");
    }
  });
});
const deviceLiveData = {}; // Store real-time device data
const categorizeWifiStrength = (rssi) => {
  const signal = parseInt(rssi, 10); // Convert string to number

  if (signal >= -65) return "Good ✅";
  if (signal >= -75) return "Moderate ⚠️";
  return "Poor ❌"; 
};
const wifidata = async (req, res) => {
  const { thingmac } = req.params;

  try {
      const params = { thingName: thingmac };
      const data = await iotData.getThingShadow(params).promise();
      const shadow = JSON.parse(data.payload);
      
      // console.log(`shadow===${JSON.stringify(shadow, null, 2)}`);
      
      // Extract Wi-Fi and Device Info
      const deviceInfo = shadow.state?.desired?.deviceInfo || [];
      const deviceState = shadow.state?.desired?.deviceState || []
      const connection = shadow.state?.desired?.status || [];
      // Check if RSSI exists or if it's missing
      const rssi = deviceInfo[0] || "Unknown"; // Default to "Unknown" if RSSI is not available
      const wifiData = {
        connection: connection,
        signalStrength: rssi === "Unknown" ? rssi : `${rssi} dBm`, // If no RSSI, show "Unknown"
        quality: categorizeWifiStrength(rssi),  // Categorize Wi-Fi signal quality
          manufacturer: deviceInfo[1] || "Unknown",    // Manufacturer name
          ipAddress: deviceInfo[2] || "Unknown",       // Local IP address (e.g., "192.168.1.24")
          firmwareVersion: deviceInfo[3] || "Unknown", // Firmware version
          deviceType: deviceInfo[5] || "Unknown",      // Device model name
          wifiSSID: deviceInfo[7] || "Unknown",        // Wi-Fi SSID
          wifiChannel: deviceInfo[9] || "Unknown"      // Wi-Fi Channel
      };

      // console.log(`Wi-Fi data: ${JSON.stringify(wifiData, null, 2)}`);
      
      // Parsing Switch Data
      let switches = [];
      if (Array.isArray(deviceState)) {
          for (let i = 0; i < deviceState.length; i += 3) {
              switches.push({
                  switchId: deviceState[i],
                  state: deviceState[i + 1] === "1" ? "ON" : "OFF",
                  brightness: deviceState[i + 2] || "0"
              });
          }
      }

      const responseData = {
          thingmac,
          wifiData,
          switches, // Include switches data if needed
          timestamp: new Date().toISOString()
      };
        
      // Update stored data
      deviceLiveData[thingmac] = responseData;
      
      res.json(responseData);
          
  } catch (error) {
      // console.error(`Error fetching data for ${thingmac}:`, error);
      res.status(500).json({ error: `Failed to fetch device data: ${error.message}` });
  }
};
// Process Incoming MQTT Messages
client.on("message", (topic, message) => {
  try {
      const thingmac = topic.split("/")[2]; // Extract device ID
      const data = JSON.parse(message.toString());
      const deviceState = data.state?.desired || {};
      const deviceInfo = deviceState.deviceInfo || [];
      const rssi = deviceInfo[0] || "Unknown";

      // Processing Wi-Fi Data
      const wifiData = {
          signalStrength: `${rssi} dBm`,
          quality: categorizeWifiStrength(rssi),
          manufacturer: deviceInfo[1] || "Unknown",
          ipAddress: deviceInfo[2] || "Unknown",
          firmwareVersion: deviceInfo[3] || "Unknown",
          deviceType: deviceInfo[5] || "Unknown",
          wifiSSID: deviceInfo[7] || "Unknown",
          wifiChannel: deviceInfo[9] || "Unknown"
      };

      let switches = [];
      if (Array.isArray(deviceState.deviceState)) {
          for (let i = 0; i < deviceState.deviceState.length; i += 3) {
              switches.push({
                  switchId: deviceState.deviceState[i],
                  state: deviceState.deviceState[i + 1] === "1" ? "ON" : "OFF",
                  brightness: deviceState.deviceState[i + 2] || "0"
              });
          }
      }

      // Storing latest data
      deviceLiveData[thingmac] = {
          thingmac,
          wifiData,
          switches,
          timestamp: new Date().toISOString()
      };

      // console.log(`📡 Updated Live Data for ${thingmac}:`, deviceLiveData[thingmac]);

      // Log device status into database (audit logs)
      handleDeviceStatus(thingmac, deviceState);

  } catch (error) {
      console.error("❌ Error processing MQTT message:", error);
  }
});

const processedMessages = new Set(); // Cache to store processed messages

async function handleDeviceStatus(deviceId, status) {
  try {
    const timestamp = new Date();
    const eventData = JSON.stringify({ status });

    // Create a unique key for deduplication (deviceId + event data + timestamp minute)
    const uniqueKey = `${deviceId}-${eventData}-${timestamp.getMinutes()}`;

    // Prevent duplicate insertions
    if (processedMessages.has(uniqueKey)) {
      // console.log(`Skipping duplicate entry for device ${deviceId}`);
      return;
    }

    processedMessages.add(uniqueKey); // Mark message as processed

    const query = `
      INSERT INTO audit_logs (thing_mac, action, event_data, timestamp)
      VALUES ($1, $2, $3, $4)
    `;

    // console.log(`Logging status for device ${deviceId}`);
    // console.log(`eventData===${eventData}`);

    // ✅ Use a fresh connection to avoid closed pool issues
    const client = await db.connect();
    try {
      await client.query(query, [deviceId, "status_update", eventData, timestamp]);
    } finally {
      client.release(); // ✅ Always release the client back to the pool
    }

    console.log(`Status logged for device ${deviceId} at ${timestamp}`);

    // ✅ Use a timeout to clear old processed messages (avoid memory issues)
    setTimeout(() => processedMessages.delete(uniqueKey), 300000);
  } catch (err) {
    console.error("Device status logging error:", err);
  }
}
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

let isDbClosed = false; // Track if the database is already closed

process.on("SIGINT", async () => {
  console.log("Disconnecting MQTT client...");
  // client.end();
  console.log("MQTT client disconnected.");

  if (!isDbClosed) {
    console.log("Closing database connection...");
    try { // ✅ Close DB pool only once
      isDbClosed = true; // ✅ Mark DB as closed
      console.log("Database connection closed.");
    } catch (err) {
      console.error("Error closing database connection:", err);
    }
  } else {
    console.log("Database connection was already closed.");
  }

  process.exit(0);
});

module.exports = {client,wifidata};
