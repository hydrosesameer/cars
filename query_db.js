const db = require('./database/db');
const fs = require('fs');
async function run() {
    try {
        const conn = await db.getConnection();
        const [items] = await conn.query('SELECT id, inward_id, item_id, description FROM inward_items LIMIT 10');
        fs.writeFileSync('items_out.txt', JSON.stringify(items, null, 2) + '\n');
        
        const [masterItems] = await conn.query('SELECT id, description FROM items LIMIT 5');
        fs.appendFileSync('items_out.txt', JSON.stringify(masterItems, null, 2));
        
        conn.release();
        process.exit(0);
    } catch (e) {
        fs.writeFileSync('items_out.txt', e.toString());
        process.exit(1);
    }
}
run();
