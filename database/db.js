const mysql = require('mysql2/promise');

// Use MYSQL_URL if provided, otherwise reconstruct from Railway components
const pool = mysql.createPool(process.env.MYSQL_URL || {
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'cafs',
    port: process.env.MYSQLPORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true 
});

module.exports = pool;
