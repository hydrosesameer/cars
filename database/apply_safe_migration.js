const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * SAFE MIGRATION SCRIPT
 * This script applies only CREATE IF NOT EXISTS and ALTER TABLE statements.
 * It DOES NOT drop tables or delete any data.
 */
async function applyMigration() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log("------------------------------------------------------------------");
        console.log("Usage: node database/apply_safe_migration.js <HOST:PORT> <USER> <PASSWORD> <DATABASE>");
        console.log("Example: node database/apply_safe_migration.js autorack.proxy.rlwy.net:12345 root password_here cafs");
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

        console.log("Reading migration_v2_columns_only.sql...");
        const migrationPath = path.join(__dirname, 'migration_v2_columns_only.sql');
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');

        console.log("Applying safe schema updates (Add columns and tables only)...");
        await remoteDb.query(migrationSql);

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
