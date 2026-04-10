const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function clearData() {
    const sqlUrl = process.env.MYSQL_URL || 'mysql://root:jhNnYiCwRwVhflaWqxBJpBRfnqalrPpK@yamabiko.proxy.rlwy.net:12136/railway';
    
    console.log('Connecting to database...');
    const connection = await mysql.createConnection(sqlUrl + '?multipleStatements=true');
    
    try {
        const sqlPath = path.join(__dirname, '../database/clear_all_data.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('Executing clear_all_data.sql...');
        await connection.query(sql);
        console.log('Successfully cleared all inventory and transaction data.');
    } catch (error) {
        console.error('Error clearing data:', error.message);
    } finally {
        await connection.end();
    }
}

clearData();
