const mqtt = require("mqtt");
const db = require("../middlewares/dbconnection");
require("dotenv").config(); // For environment variables

// MQTT Broker Connection
const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com"; // Use .env or default to HiveMQ
const client = mqtt.connect(brokerUrl);

console.log("mqtt page working")
// Subscribe and handle MQTT topics
// client.on("connect", () => {
//     console.log("Connected to MQTT broker");

//     // Subscribe to wildcard topics for audit logs and statuses
//     const topics = ["devices/+/auditlog", "devices/+/status","devices/+/wifi_status"];
//     client.subscribe(topics, (err) => {
//         if (!err) {
//             console.log(`Subscribed to topics: ${topics.join(", ")}`);
//         } else {
//             console.error("Subscription error:", err);
//         }
//     });
// });
// Subscribe to all device status topics
client.on("connect", () => {
    client.subscribe("devices/+/status", (err) => {
      if (err) {
        console.error("Subscription error:", err);
      } else {
        console.log("Subscribed to device status topics");
      }
    });
  });

  const AWS = require("aws-sdk");
const iotData = new AWS.IotData({ endpoint: "an1ua1ij15hp7-ats.iot.ap-south-1.amazonaws.com" });

const getDeviceStatus = async (deviceId) => {
  const params = {
    thingName: deviceId
  };

  try {
    const data = await iotData.getThingShadow(params).promise();
    const shadow = JSON.parse(data.payload);
    console.log(`Device ${deviceId} Status:`, shadow.state.reported.status);
  } catch (err) {
    console.error(`Error fetching status for device ${deviceId}:`, err);
  }
};

getDeviceStatus("84F703B5F560_1");
// Unified message handler
client.on("message", (topic, message) => {
    console.log(`Message received on ${topic}: ${message.toString()}`);

    const topicParts = topic.split("/");
    if (topicParts.length < 3) {
        console.error("Invalid topic format:", topic);
        return;
    }

    const deviceId = topicParts[1];
    const topicType = topicParts[2];

    try {
        if (topicType === "auditlog") {
            handleAuditLog(deviceId, message.toString());
        } else if (topicType === "status") {
            handleDeviceStatus(deviceId, message.toString());
        }  else if (topicType === "wifi_status") {
            handleWifiStatus(deviceId, message.toString());
        } else {
            console.warn("Unhandled topic type:", topicType);
        }
    } catch (error) {
        console.error("Error processing message:", error);
    }
});

// Handle audit log messages
function handleAuditLog(deviceId, message) {
    try {
        const logData = JSON.parse(message);
        const query = `
            INSERT INTO audit_logs (device_id, event_type, event_data)
            VALUES ($1, $2, $3)
        `;
        db.query(
            query,
            [deviceId, logData.event_type, JSON.stringify(logData.event_data)],
            (err) => {
                if (err) {
                    console.error("Audit log insertion error:", err);
                } else {
                    console.log(`Audit log inserted for device ${deviceId}`);
                }
            }
        );
    } catch (error) {
        console.error("Failed to parse audit log message:", error);
    }
}

// Handle device status messages
function handleDeviceStatus(deviceId, status) {
    const query = `
        UPDATE Devices
        SET enable = $1, lastModified = $2
        WHERE deviceId = $3
    `;
    db.query(
        query,
        [status === "online", new Date(), deviceId],
        (err) => {
            if (err) {
                console.error("Device status update error:", err);
            } else {
                console.log(`Updated status for ${deviceId}: ${status}`);
            }
        }
    );
}

// Handle Wi-Fi status messages
function handleWifiStatus(deviceId, message) {
    try {
        const wifiData = JSON.parse(message);
        const query = `
            INSERT INTO wifi_status_logs (device_id, ssid, signal_strength, ip_address, timestamp)
            VALUES ($1, $2, $3, $4, $5)
        `;
        db.query(
            query,
            [
                deviceId,
                wifiData.ssid,
                wifiData.signal_strength,
                wifiData.ip_address,
                new Date(),
            ],
            (err) => {
                if (err) {
                    console.error("Wi-Fi status insertion error:", err);
                } else {
                    console.log(`Wi-Fi status logged for device ${deviceId}`);
                }
            }
        );
    } catch (error) {
        console.error("Failed to parse Wi-Fi status message:", error);
    }
}


// Graceful shutdown for MQTT and database
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