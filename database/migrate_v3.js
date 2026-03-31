const db = require('./db');

async function migrate() {
    console.log("Starting Migration V3: Add missing columns for Outward entries...");
    
    try {
        // 1. Add to_warehouse to outward_entries
        console.log("Checking for 'to_warehouse' column...");
        const [cols1] = await db.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outward_entries' AND COLUMN_NAME = 'to_warehouse'
        `);
        
        if (cols1.length === 0) {
            console.log("Adding 'to_warehouse' column to outward_entries...");
            await db.query("ALTER TABLE outward_entries ADD COLUMN to_warehouse TEXT DEFAULT NULL");
        } else {
            console.log("'to_warehouse' already exists.");
        }

        // 2. Add registration_no_of_means_of_transport if missing
        console.log("Checking for 'registration_no_of_means_of_transport' column...");
        const [cols2] = await db.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outward_entries' AND COLUMN_NAME = 'registration_no_of_means_of_transport'
        `);
        
        if (cols2.length === 0) {
            console.log("Adding 'registration_no_of_means_of_transport' column to outward_entries...");
            await db.query("ALTER TABLE outward_entries ADD COLUMN registration_no_of_means_of_transport VARCHAR(100) DEFAULT NULL");
        } else {
            console.log("'registration_no_of_means_of_transport' already exists.");
        }

        console.log("✅ Migration V3 completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        process.exit(1);
    }
}

migrate();
