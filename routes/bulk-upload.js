const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const upload = multer({ dest: '/tmp/' });

router.post('/stock', upload.single('file'), async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            const connection = await db.getConnection();
            await connection.beginTransaction();

            try {
                // Group items by (date, consignment, bond_no)
                const groups = {};
                for (const row of results) {
                    const key = `${row.date || ''}_${row.consignment || ''}_${row.bond_no || ''}`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(row);
                }

                for (const key in groups) {
                    const groupRows = groups[key];
                    const firstRow = groupRows[0];

                    // 1. Find or create consignment
                    let consignmentId = null;
                    if (firstRow.consignment) {
                        const [consignments] = await connection.query('SELECT id FROM consignments WHERE name = ?', [firstRow.consignment.trim()]);
                        if (consignments.length > 0) {
                            consignmentId = consignments[0].id;
                        } else {
                            const [res] = await connection.query('INSERT INTO consignments (name, type) VALUES (?, ?)', [firstRow.consignment.trim(), 'AIRLINE']);
                            consignmentId = res.insertId;
                        }
                    }

                    // 2. Create one inward entry (Header) for this group
                    const dateOfReceipt = firstRow.date || new Date().toISOString().split('T')[0];
                    const [entryResult] = await connection.query(`
                        INSERT INTO inward_entries (
                            be_no, be_date, bond_no, bond_date, date_of_receipt, 
                            consignment_id, branch_id, mode_of_receipt, warehouse_code,
                            qty_received, initial_bonding_expiry
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        'BULK-' + Date.now(), dateOfReceipt, 
                        firstRow.bond_no || ('B' + Date.now()), firstRow.bond_date || null,
                        dateOfReceipt, consignmentId, branch_id || null, 'BULK UPLOAD', 'Cok15003',
                        groupRows.reduce((sum, r) => sum + (parseInt(r.qty) || 0), 0),
                        firstRow.bond_expiry || null
                    ]);

                    const inwardId = entryResult.insertId;

                    // 3. Create inward items for this entry
                    for (const row of groupRows) {
                        // Find or create item
                        let itemId = null;
                        if (row.description) {
                            const [items] = await connection.query('SELECT id FROM items WHERE description = ?', [row.description.trim()]);
                            if (items.length > 0) {
                                itemId = items[0].id;
                            } else {
                                const [res] = await connection.query('INSERT INTO items (description, unit) VALUES (?, ?)', [row.description.trim(), row.unit || 'PCS']);
                                itemId = res.insertId;
                            }
                        }

                        await connection.query(`
                            INSERT INTO inward_items (
                                inward_id, item_id, description, qty, unit, 
                                value, duty, bond_no, bond_expiry
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            inwardId, itemId, row.description || 'Unknown Item', 
                            row.qty || 0, row.unit || 'PCS',
                            row.value || 0, row.duty || 0,
                            row.bond_no || null, row.bond_expiry || null
                        ]);
                    }
                }

                await connection.commit();
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.json({ message: `Successfully processed ${results.length} items into ${Object.keys(groups).length} entries` });
            } catch (error) {
                await connection.rollback();
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.status(500).json({ error: error.message });
            } finally {
                connection.release();
            }
        });
});

module.exports = router;
