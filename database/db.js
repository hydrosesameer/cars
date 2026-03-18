const mysql = require('mysql2/promise');

const pool = mysql.createPool(process.env.MYSQL_URL || {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'cafs',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true 
});

module.exports = pool;
