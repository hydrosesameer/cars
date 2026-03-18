const db = require('./database/db');
const fs = require('fs');

async function testFormA(conn) {
    let out = "--- TESTING FORM A ---\n";
    const item_id = "13"; // Using 13 as reported by subagent
    out += "Testing item_id: " + item_id + "\n";
    
    let query = `
            SELECT ii.id as inward_item_id, ii.description, ii.item_id
            FROM inward_items ii
            JOIN inward_entries ie ON ii.inward_id = ie.id
            WHERE 1=1
        `;
    let params = [];
    
    const [[itemRecord]] = await conn.query('SELECT description FROM items WHERE id = ?', [item_id]);
    const itemDesc = itemRecord ? itemRecord.description : null;
    out += "Master item description found: " + itemDesc + "\n";

    if (itemDesc) {
        query += ' AND (ii.item_id = ? OR ii.item_id = ? OR ii.description = ?)'; 
        params.push(parseInt(item_id));
        params.push(parseInt(item_id).toString());
        params.push(itemDesc);
    } else {
        query += ' AND (ii.item_id = ? OR ii.item_id = ?)'; 
        params.push(parseInt(item_id));
        params.push(parseInt(item_id).toString());
    }
    
    out += "SQL: " + query + "\n";
    out += "PARAMS: " + JSON.stringify(params) + "\n";
    
    const [entries] = await conn.query(query, params);
    out += "Result count: " + entries.length + "\n";
    if(entries.length > 0) out += JSON.stringify(entries[0]) + "\n";
    return out;
}

async function testFormB(conn) {
    let out = "\n--- TESTING FORM B ---\n";
    
    const [consignments] = await conn.query('SELECT id, name FROM consignments');
    out += "Consignments: " + JSON.stringify(consignments) + "\n";
    
    // Test with the backend API query exactly as written
    const targetMonth = 3;
    const targetYear = 2026;
    const startDate = '2026-03-01';
    const endDate = '2026-04-01';
    
    let query = `
            SELECT ie.id, c.name as consignment_name
            FROM inward_entries ie
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE (
                (ie.initial_bonding_expiry >= ? AND ie.initial_bonding_expiry < ?)
                OR (ie.extended_bonding_expiry1 >= ? AND ie.extended_bonding_expiry1 < ?)
                OR (ie.extended_bonding_expiry2 >= ? AND ie.extended_bonding_expiry2 < ?)
            )
            AND ie.qty_received > 0
        `;
    let params = [startDate, endDate, startDate, endDate, startDate, endDate];
    
    const req_query_consignment_id = "1"; // Try ID 1 initially
    
    if (req_query_consignment_id) {
        query += ` AND ie.consignment_id = ?`;
        params.push(req_query_consignment_id);
    }
    
    query += ` ORDER BY c.name, ie.initial_bonding_expiry`;
    
    out += "SQL: " + query + "\n";
    out += "PARAMS: " + JSON.stringify(params) + "\n";
    
    const [entries] = await conn.query(query, params);
    out += "Result count (Consignment 1): " + entries.length + "\n";
    if(entries.length > 0) out += "First entry: " + JSON.stringify(entries[0]) + "\n";
    
    return out;
}

async function run() {
    try {
        const conn = await db.getConnection();
        let finalOut = "";
        finalOut += await testFormA(conn);
        finalOut += await testFormB(conn);
        fs.writeFileSync('test_out.txt', finalOut);
        conn.release();
        process.exit(0);
    } catch(e) {
        fs.writeFileSync('test_out.txt', e.toString());
        process.exit(1);
    }
}
run();
