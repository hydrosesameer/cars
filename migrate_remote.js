const mysql = require('mysql2/promise');

async function migrateData() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log("Usage: node migrate_remote.js <HOST> <USER> <PASSWORD> <DATABASE>");
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

    const tables = [
        'users', 'branches', 'consignments', 'items', 
        'inward_entries', 'inward_items', 'shipping_bills', 
        'outward_entries', 'outward_items', 'damaged_items', 
        'return_stock_entries', 'flight_numbers'
    ];

    console.log("Starting data migration...");
    await remoteDb.query("SET FOREIGN_KEY_CHECKS = 0;");

    for (const table of tables) {
        console.log(`Migrating table: ${table}...`);
        const [rows] = await localDb.query(`SELECT * FROM ${table}`);
        if (rows.length === 0) {
            console.log(`No data in local table ${table}. Skipping.`);
            continue;
        }

        console.log(`Pushing ${rows.length} rows to remote ${table}...`);
        await remoteDb.query(`TRUNCATE TABLE ${table};`);

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
    console.log("✅ Migration complete!");

    await localDb.end();
    await remoteDb.end();
}

migrateData().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
