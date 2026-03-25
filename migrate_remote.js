const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function migrateData() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log("Usage: node migrate_remote.js <HOST:PORT> <USER> <PASSWORD> <DATABASE>");
        process.exit(1);
    }

    const [hostAndPort, user, password, database] = args;
    const [host, port] = hostAndPort.split(':');

    console.log(`Connecting to LOCAL database...`);
    const localDb = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'cafs'
    });

    console.log(`Connecting to REMOTE database (${host}:${port || 3306})...`);
    const remoteDb = await mysql.createConnection({
        host: host,
        port: port || 3306,
        user: user,
        password: password,
        database: database,
        multipleStatements: true
    });

    console.log("Cleaning up remote database structure...");
    await remoteDb.query("SET FOREIGN_KEY_CHECKS = 0;");
    
    // Explicitly drop tables in reverse order to ensure clean state
    const tablesToDrop = [
        'flight_numbers', 'return_stock_entries', 'shipping_bill_items', 'shipping_bills', 
        'damaged_items', 'outward_items', 'outward_entries', 
        'inward_items', 'inward_entries', 'items', 'consignments', 
        'users', 'branches'
    ];
    for (const t of tablesToDrop) {
        try {
            await remoteDb.query(`DROP TABLE IF EXISTS \`${t}\`;`);
        } catch(e) { console.log(`Drop failed for ${t}:`, e.message); }
    }

    console.log("Applying ground-truth schema (database/schema.sql)...");
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await remoteDb.query(schema);

    const tablesToMigrate = [
        'branches', 'users', 'consignments', 'items', 
        'inward_entries', 'inward_items', 'shipping_bills', 
        'outward_entries', 'outward_items', 'damaged_items', 
        'return_stock_entries', 'flight_numbers'
    ];

    console.log("Starting data transfer...");
    for (const table of tablesToMigrate) {
        console.log(`Migrating table: ${table}...`);
        const [rows] = await localDb.query(`SELECT * FROM \`${table}\``);
        if (rows.length === 0) {
            console.log(`No data in local ${table}. Skipping.`);
            continue;
        }

        console.log(`Pushing ${rows.length} rows to remote ${table}...`);
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
            await remoteDb.query(`INSERT INTO \`${table}\` (${columnNames}) VALUES (${values});`);
        }
    }

    await remoteDb.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("✅ Full schema & data migration complete!");

    await localDb.end();
    await remoteDb.end();
}

migrateData().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
