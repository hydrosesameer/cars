const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * SAFE MIGRATION SCRIPT (JS-NATIVE VERSION)
 * Checks for existing columns before adding them to avoid syntax errors 
 * and "already exists" errors across different MySQL/MariaDB versions.
 */
async function applyMigration() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log("------------------------------------------------------------------");
        console.log("Usage: node database/apply_safe_migration.js <HOST:PORT> <USER> <PASSWORD> <DATABASE>");
        console.log("Example: node database/apply_safe_migration.js autorack.proxy.rlwy.net:12345 root password_here railway");
        console.log("------------------------------------------------------------------");
        process.exit(1);
    }

    const [hostAndPort, user, password, database] = args;
    const [host, port] = hostAndPort.split(':');

    console.log(`Connecting to REMOTE database (${host}:${port || 3306})...`);
    
    try {
        const remoteDb = await mysql.createConnection({
            host: host,
            port: port || 3306,
            user: user,
            password: password,
            database: database,
            multipleStatements: true
        });

        // 1. Create Countries
        console.log("Creating countries table if missing...");
        await remoteDb.query(`
            CREATE TABLE IF NOT EXISTS \`countries\` (
                \`id\` int(11) NOT NULL AUTO_INCREMENT,
                \`name\` varchar(100) NOT NULL,
                \`code\` varchar(10) NOT NULL,
                \`port_of_discharge\` varchar(100) DEFAULT NULL,
                \`created_at\` datetime DEFAULT current_timestamp(),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Helper to add column safely
        async function addColumnSafely(table, column, definition) {
            const [cols] = await remoteDb.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
            `, [database, table, column]);

            if (cols.length === 0) {
                console.log(`Adding column ${column} to ${table}...`);
                await remoteDb.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
            } else {
                console.log(`Column ${column} already exists in ${table}. Skipping.`);
            }
        }

        // 2. Update branches
        await addColumnSafely('branches', 'airport_code', 'varchar(10) DEFAULT NULL');

        // 3. Update entries (Header)
        await addColumnSafely('inward_entries', 'branch_id', 'int(11) DEFAULT NULL');
        await addColumnSafely('outward_entries', 'branch_id', 'int(11) DEFAULT NULL');

        // 4. Update items (Details)
        await addColumnSafely('inward_items', 'bond_date', 'date DEFAULT NULL');
        await addColumnSafely('inward_items', 'duty_percent', 'varchar(50) DEFAULT NULL');

        // 5. Update shipping_bills
        const sb_cols = [
            ['sb_no', 'varchar(50) DEFAULT NULL'],
            ['sb_date', 'date DEFAULT NULL'],
            ['flight_no', 'varchar(50) DEFAULT NULL'],
            ['etd', 'date DEFAULT NULL'],
            ['vt', 'varchar(50) DEFAULT NULL'],
            ['port_of_discharge', 'varchar(100) DEFAULT NULL'],
            ['country_of_destination', 'varchar(100) DEFAULT NULL'],
            ['station', 'varchar(100) DEFAULT NULL'],
            ['exporter_name', 'varchar(255) DEFAULT NULL'],
            ['exporter_address', 'text DEFAULT NULL'],
            ['entered_no', 'varchar(50) DEFAULT NULL'],
            ['branch_id', 'int(11) DEFAULT NULL'],
            ['unapproved_by', 'varchar(100) DEFAULT NULL'],
            ['unapproved_at', 'datetime DEFAULT NULL'],
            ['unapproved_remarks', 'text DEFAULT NULL']
        ];

        for (const [col, def] of sb_cols) {
            await addColumnSafely('shipping_bills', col, def);
        }

        console.log("✅ SUCCESS: Remote schema updated safely. No data was affected.");
        await remoteDb.end();
    } catch (error) {
        console.error("❌ ERROR: Migration failed!");
        console.error(error.message);
        process.exit(1);
    }
}

applyMigration().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
