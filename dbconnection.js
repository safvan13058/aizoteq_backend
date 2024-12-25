const mysql = require('mysql2/promise'); // Use `mysql2/promise` for async/await support

const db = mysql.createPool({
    host: 'local',
    user: 'root',
    password: '',
    database: 'aizoteq',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Connect to MySQL

module.exports=db;