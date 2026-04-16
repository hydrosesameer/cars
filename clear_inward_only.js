const mysql = require('mysql2/promise');

async function clearInwardData() {
  const connectionString = 'mysql://root:jhNnYiCwRwVhflaWqxBJpBRfnqalrPpK@yamabiko.proxy.rlwy.net:12136/railway';
  const db = await mysql.createConnection(connectionString);
  
  try {
    console.log('Connecting to Railway database to clear inward data...');
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    
    console.log('Clearing inward_items...');
    await db.query('TRUNCATE TABLE inward_items');
    await db.query('ALTER TABLE inward_items AUTO_INCREMENT = 1');
    
    console.log('Clearing inward_entries...');
    await db.query('TRUNCATE TABLE inward_entries');
    await db.query('ALTER TABLE inward_entries AUTO_INCREMENT = 1');
    
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Successfully cleared inward_items and inward_entries data.');
  } catch (error) {
    console.error('Error clearing data:', error.message);
  } finally {
    await db.end();
  }
}

clearInwardData();
