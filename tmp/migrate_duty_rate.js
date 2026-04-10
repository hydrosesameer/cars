const db = require('../database/db');

async function migrate() {
    try {
        console.log('Changing duty_rate to VARCHAR in inward_entries...');
        await db.query('ALTER TABLE inward_entries MODIFY duty_rate VARCHAR(100);');
        console.log('Changing value_rate to VARCHAR in inward_entries too just in case...');
        await db.query('ALTER TABLE inward_entries MODIFY value_rate VARCHAR(100);');
        console.log('Migration complete!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
