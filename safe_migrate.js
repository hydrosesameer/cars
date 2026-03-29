const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function safeMigrate() {
    const args = process.argv.slice(2);
    if (args.length < 4) {
        console.log("Usage: node safe_migrate.js <HOST:PORT> <USER> <PASSWORD> <DATABASE>");
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

    // Get all tables from local
    const [localTablesRaw] = await localDb.query("SHOW TABLES");
    const localTables = localTablesRaw.map(r => Object.values(r)[0]);

    // Get all tables from remote
    const [remoteTablesRaw] = await remoteDb.query("SHOW TABLES");
    const remoteTables = remoteTablesRaw.map(r => Object.values(r)[0]);

    console.log("=======================================");
    console.log("Analyzing schema differences...");
    console.log("=======================================\n");

    let changesMade = false;

    for (const table of localTables) {
        if (!remoteTables.includes(table)) {
            console.log(`[TABLE] '${table}' is missing on remote. Creating it...`);
            const [createTableResult] = await localDb.query(`SHOW CREATE TABLE \`${table}\``);
            const createSql = createTableResult[0]['Create Table'];
            await remoteDb.query(createSql);
            console.log(`  ✅ Created table '${table}'.\n`);
            changesMade = true;
            continue;
        }

        // Table exists, check columns
        const [localColsRaw] = await localDb.query(`SHOW COLUMNS FROM \`${table}\``);
        const localCols = localColsRaw.map(r => r.Field);

        const [remoteColsRaw] = await remoteDb.query(`SHOW COLUMNS FROM \`${table}\``);
        const remoteCols = remoteColsRaw.map(r => r.Field);

        const [createTableResult] = await localDb.query(`SHOW CREATE TABLE \`${table}\``);
        const createSql = createTableResult[0]['Create Table'];
        const scriptLines = createSql.split('\n');

        let tableChanges = false;
        
        for (const col of localCols) {
            if (!remoteCols.includes(col)) {
                if (!tableChanges) console.log(`[COLUMN] Updates needed for table '${table}':`);
                tableChanges = true;
                changesMade = true;
                
                console.log(`  -> Column '${col}' is missing. Adding it...`);
                
                // Find column definition in the CREATE TABLE string
                const colLine = scriptLines.find(l => l.trim().startsWith(`\`${col}\``));
                if (colLine) {
                    let colDef = colLine.trim();
                    if (colDef.endsWith(',')) {
                        colDef = colDef.slice(0, -1);
                    }
                    
                    try {
                        const alterQuery = `ALTER TABLE \`${table}\` ADD COLUMN ${colDef};`;
                        await remoteDb.query(alterQuery);
                        console.log(`  ✅ Successfully added column '${col}'.`);
                    } catch (err) {
                        console.error(`  ❌ Failed to add column '${col}':`, err.message);
                    }
                } else {
                    console.log(`  ⚠️ Could not find definition for column '${col}' in local SHOW CREATE TABLE.`);
                }
            }
        }
        if (tableChanges) console.log(""); // Empty line for readability
    }

    if (!changesMade) {
        console.log("✨ No missing tables or columns found! The schemas match.");
    }

    console.log("=======================================");
    console.log("✅ Safe schema migration complete! Your data was untouched.");
    console.log("=======================================");
    
    await localDb.end();
    await remoteDb.end();
}

safeMigrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
