const mqtt = require("mqtt");
const db = require("../middlewares/dbconnection");
require("dotenv").config(); // For environment variables
const AWS = require("aws-sdk");

// MQTT Broker Connection
const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com";


const fs = require("fs");

const client = mqtt.connect("mqtts://an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com", {
  port: 8883,
  clientId:process.env.clientId,
  key: fs.readFileSync("certificate/6a0a97bedd386d5837744332548efa1cb7b4eec6e3583d566f53e93030807a87-private.pem.key"),
  cert: fs.readFileSync("certificate/6a0a97bedd386d5837744332548efa1cb7b4eec6e3583d566f53e93030807a87-certificate.pem.crt"),
  ca: fs.readFileSync("certificate/AmazonRootCA1.pem"),
});

client.on("connect", () => {
  console.log("Connected to AWS IoT Core via MQTTS");
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

// Function to log switch status change into the database
const logSwitchStatusChange = async (deviceId, switchId, status, brightness, userId) => {
  try {
    // Check if the device_id exists in the devices table
    const checkDeviceQuery = "SELECT COUNT(*) FROM devices WHERE deviceid = $1";
    const result = await db.query(checkDeviceQuery, [deviceId]);

    if (parseInt(result.rows[0].count) === 0) {
      console.log(`Device ${deviceId} not found in devices table. Skipping log.`);
      return; // Skip logging if device_id doesn't exist
    }

    // Log the switch status change
    const query = `
      INSERT INTO audit_logs (thing_mac, device_id, action, user_id, timestamp)
      VALUES ($1, $2, $3, $4, $5)
    `;
    const timestamp = new Date().toISOString();
    const thingMac = deviceId;

    await db.query(query, [thingMac, switchId, `${status}`, userId, timestamp]);
    console.log(`Switch ${switchId} status logged: ${status}, brightness: ${brightness}`);
  } catch (error) {
    console.error("Error logging switch status:", error);
  }
};
// mqtt.setLogLevel('debug'); // Enable debugging logs
// Function to fetch the device status
// const getDeviceStatus = async (deviceId) => {
//   const params = { thingName: deviceId };
//   try {
//     const data = await iotData.getThingShadow(params).promise();
//     const shadow = JSON.parse(data.payload);

//     const desired = shadow.state?.desired || {};
//     const delta = shadow.state?.delta || {};

//     const switches = [];
//     let switchCount = 0;

//     // Parse switches (keys starting with 's')
//     for (const key in desired) {
//       if (key.startsWith("s")) {
//         switchCount++;
//         const switchId = `${deviceId}_${switchCount}`;
//         const status = desired[key] === "1" ? "ON" : "OFF";
//         const brightness = desired[`v${switchCount}`] || 0;

//         switches.push({
//           switchId,
//           status,
//           brightness,
//           deltaStatus: delta[key] === "1" ? "ON" : "OFF",
//           deltaBrightness: delta[`v${switchCount}`] || 0,
//         });
//       }
//     }

//     return {
//       deviceId,
//       status: desired.status || "unknown",
//       command: desired.command || "unknown",
//       toggleState: desired.t || "OFF",
//       switches,
//       brightness: {
//         on: desired.on_bright || 0,
//         off: desired.off_bright || 0,
//       },
//       deviceInfo: desired.deviceInfo || [],
//       deltaState: delta,
//     };
//   } catch (error) {
//     throw new Error(`Failed to fetch device status for ${deviceId}: ${error.message}`);
//   }
// };

// // Function to monitor and log switch changes
// const monitorSwitchChanges = async (deviceId, userId) => {
//   try {
//     const deviceStatus = await getDeviceStatus(deviceId);

//     deviceStatus.switches.forEach((sw) => {
//       const previousState = deviceStatus.deltaState[`s${sw.switchId.slice(-1)}`];
//       const previousBrightness = deviceStatus.deltaState[`v${sw.switchId.slice(-1)}`];

//       if (sw.status !== previousState || sw.brightness !== previousBrightness) {
//         logSwitchStatusChange(deviceId, sw.switchId, sw.status, sw.brightness, userId);
//       }
//     });
//   } catch (error) {
//     console.error("Error monitoring switch changes:", error);
//   }
// };
const getDeviceStatus = async (deviceId) => {
  const params = { thingName: deviceId };
  console.log(`[DEBUG] Fetching shadow for device: ${deviceId}`); // Debug log
  
  try {
    const data = await iotData.getThingShadow(params).promise();
    console.log(`[DEBUG] Received shadow data for device ${deviceId}:`, JSON.stringify(data)); // Debug log
    
    const shadow = JSON.parse(data.payload);

    const desired = shadow.state?.desired || {};
    const delta = shadow.state?.delta || {};
    console.log(`[DEBUG] Parsed desired state for ${deviceId}:`, desired); // Debug log
    console.log(`[DEBUG] Parsed delta state for ${deviceId}:`, delta); // Debug log

    const switches = [];
    let switchCount = 0;

    // Parse switches (keys starting with 's')
    for (const key in desired) {
      if (key.startsWith("s")) {
        switchCount++;
        const switchId = `${deviceId}_${switchCount}`;
        const status = desired[key] === "1" ? "ON" : "OFF";
        const brightness = desired[`v${switchCount}`] || 0;

        console.log(
          `[DEBUG] Switch parsed - Switch ID: ${switchId}, Status: ${status}, Brightness: ${brightness}`
        ); // Debug log

        switches.push({
          switchId,
          status,
          brightness,
          deltaStatus: delta[key] === "1" ? "ON" : "OFF",
          deltaBrightness: delta[`v${switchCount}`] || 0,
        });
      }
    }

    console.log(`[DEBUG] Switches for device ${deviceId}:`, switches); // Debug log

    return {
      deviceId,
      status: desired.status || "unknown",
      command: desired.command || "unknown",
      toggleState: desired.t || "OFF",
      switches,
      brightness: {
        on: desired.on_bright || 0,
        off: desired.off_bright || 0,
      },
      deviceInfo: desired.deviceInfo || [],
      deltaState: delta,
    };
  } catch (error) {
    console.error(`[ERROR] Failed to fetch device status for ${deviceId}:`, error.message); // Error log
    throw new Error(`Failed to fetch device status for ${deviceId}: ${error.message}`);
  }
};

// Function to monitor and log switch changes
const monitorSwitchChanges = async (deviceId, userId) => {
  console.log(`[DEBUG] Monitoring switch changes for device: ${deviceId}, User ID: ${userId}`); // Debug log
  
  try {
    const deviceStatus = await getDeviceStatus(deviceId);
    console.log(`[DEBUG] Device status for ${deviceId}:`, deviceStatus); // Debug log

    deviceStatus.switches.forEach((sw) => {
      console.log(`[DEBUG] Checking switch: ${sw.switchId}`); // Debug log
      
      const previousState = deviceStatus.deltaState[`s${sw.switchId.slice(-1)}`];
      const previousBrightness = deviceStatus.deltaState[`v${sw.switchId.slice(-1)}`];

      console.log(
        `[DEBUG] Switch: ${sw.switchId}, Previous State: ${previousState}, Previous Brightness: ${previousBrightness}`
      ); // Debug log

      if (sw.status !== previousState || sw.brightness !== previousBrightness) {
        console.log(
          `[DEBUG] Detected change in switch ${sw.switchId} - New State: ${sw.status}, New Brightness: ${sw.brightness}`
        ); // Debug log
        
        logSwitchStatusChange(deviceId, sw.switchId, sw.status, sw.brightness, userId);
      } else {
        console.log(`[DEBUG] No change detected for switch ${sw.switchId}`); // Debug log
      }
    });
  } catch (error) {
    console.error(`[ERROR] Error monitoring switch changes for device ${deviceId}:`, error.message); // Error log
  }
};

// MQTT Connection and Subscription
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

client.on("message", async (topic, message) => {
  try {
    console.log(`Received message on topic: ${topic}`);
    console.log(`Message: ${message.toString()}`);

    const deviceId = topic.split("/")[2];
    await monitorSwitchChanges(deviceId, 1); // Assuming userId = 1
  } catch (error) {
    console.error("Error processing message:", error);
  }
});

client.on("error", (err) => {
  console.error("MQTT client connection error:", err);
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
