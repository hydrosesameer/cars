const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function exportData() {
    const db = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'cafs',
        multipleStatements: true
    });

    const tables = [
        'users', 'branches', 'consignments', 'items', 
        'inward_entries', 'inward_items', 'shipping_bills', 
        'outward_entries', 'outward_items', 'damaged_items', 
        'return_stock_entries', 'flight_numbers'
    ];

    let sqlDump = "-- CAFS Data Export - " + new Date().toISOString() + "\n";
    sqlDump += "SET FOREIGN_KEY_CHECKS = 0;\n\n";

    for (const table of tables) {
        console.log(`Exporting table: ${table}...`);
        try {
            const [rows] = await db.query(`SELECT * FROM ${table}`);
            if (rows.length === 0) continue;

            sqlDump += `-- Data for ${table} (${rows.length} rows)\n`;
            sqlDump += `TRUNCATE TABLE ${table};\n`;

            const columns = Object.keys(rows[0]);
            const columnNames = columns.map(c => `\`${c}\``).join(', ');

            for (const row of rows) {
                const values = columns.map(col => {
                    const val = row[col];
                    if (val === null) return 'NULL';
                    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                    if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
                    return val;
                }).join(', ');
                sqlDump += `INSERT INTO \`${table}\` (${columnNames}) VALUES (${values});\n`;
            }
            sqlDump += "\n";
        } catch (err) {
            console.error(`Error exporting ${table}:`, err.message);
        }
    }

    sqlDump += "SET FOREIGN_KEY_CHECKS = 1;\n";

    const outputPath = path.join(__dirname, 'database', 'latest_data_dump.sql');
    fs.writeFileSync(outputPath, sqlDump);
    console.log(`✅ Data export complete: ${outputPath}`);
    await db.end();
}

exportData().catch(err => {
    console.error("Critical error during export:", err);
    process.exit(1);
});
