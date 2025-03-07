const { Pool } = require('pg'); // Import PostgreSQL library
const fs = require('fs'); // To handle SSL certificates if required

// Create a connection pool
const db = new Pool({
    host: 'database-1.cdiqmk28wk12.ap-south-1.rds.amazonaws.com', // AWS RDS or Aurora endpoint
    user: 'postgres',                      // Your database username
    password: 'Aizo12345',                 // Your database password
    database: 'postgres',                  // Your database name
    port: 5432,                            // Default PostgreSQL port
    max: 10,                               // Maximum number of connections in the pool
    // idleTimeoutMillis: 30000,           // Close idle connections after 30 seconds
    // connectionTimeoutMillis: 2000,      // Timeout if connection cannot be established
    ssl: {
        rejectUnauthorized: true,          // Ensures the server certificate is verified
        ca: fs.readFileSync('\global-bundle.pem').toString() // Optional CA cert for RDS/Aurora
    }
});
// const db = new Pool({
//     host: 'database-2.cluster-cwzuruz2sxx0.ap-south-1.rds.amazonaws.com', // AWS RDS or Aurora endpoint
//     user: 'postgres',                      // Your database username
//     password: 'aizoteqaizote',                 // Your database password
//     database: 'postgres',                  // Your database name
//     port: 5432,                            // Default PostgreSQL port
//     max: 10,                               // Maximum number of connections in the pool
//     // idleTimeoutMillis: 30000,           // Close idle connections after 30 seconds
//     // connectionTimeoutMillis: 2000,      // Timeout if connection cannot be established
//     ssl: {
//         rejectUnauthorized: true,          // Ensures the server certificate is verified
//         ca: fs.readFileSync('\global-bundle.pem').toString() // Optional CA cert for RDS/Aurora
//     }
// });
// Export the pool for use in other modules
module.exports = db;
