const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function extractSchema() {
    const db = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'cafs'
    });

    const [tables] = await db.query("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);

    let fullSchema = "SET FOREIGN_KEY_CHECKS = 0;\n\n";

    for (const table of tableNames) {
        const [createTable] = await db.query(`SHOW CREATE TABLE \`${table}\``);
        fullSchema += `${createTable[0]['Create Table']};\n\n`;
    }

    fullSchema += "SET FOREIGN_KEY_CHECKS = 1;\n";

    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    fs.writeFileSync(schemaPath, fullSchema);
    console.log(`✅ Schema extracted to ${schemaPath}`);

    await db.end();
}

extractSchema().catch(console.error);
