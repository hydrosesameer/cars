const mysql = require('mysql2/promise');
async function query() {
  const db = await mysql.createConnection('mysql://root:jhNnYiCwRwVhflaWqxBJpBRfnqalrPpK@yamabiko.proxy.rlwy.net:12136/railway');
  try {
    const [items] = await db.query('SELECT COUNT(*) as c FROM items');
    const [consigns] = await db.query('SELECT COUNT(*) as c FROM consignments');
    console.log(`Remote Items: ${items[0].c}, Consignments: ${consigns[0].c}`);
  } catch(e) {
    console.log("Error querying remote:", e.message);
  }
  await db.end();
}
query();
