const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const upload = multer({ dest: '/tmp/' });

router.post('/items', upload.single('file'), async (req, res) => {
    const db = req.app.locals.db;
    
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
                let processed = 0;
                let ignored = 0;

                for (const row of results) {
                    const description = (row.description || '').trim();
                    if (!description) {
                        ignored++;
                        continue;
                    }

                    const min_stock = parseInt(row['min stock'] || row.min_stock) || 0;
                    const code = row.code || row.hsn_code || null;

                    // Check if already exists
                    const [existing] = await connection.query('SELECT id FROM items WHERE description = ?', [description]);
                    
                    if (existing.length === 0) {
                        await connection.query(`
                            INSERT INTO items (description, unit, hsn_code, category, min_stock)
                            VALUES (?, ?, ?, ?, ?)
                        `, [
                            description, 
                            row.unit || 'PCS', 
                            code, 
                            row.category || null, 
                            min_stock
                        ]);
                        processed++;
                    } else {
                        // Update existing min_stock and code
                        await connection.query(`
                            UPDATE items SET min_stock = ?, hsn_code = ? 
                            WHERE id = ?
                        `, [min_stock, code, existing[0].id]);
                        processed++; // Count as processed since we updated it
                    }
                }

                await connection.commit();
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.json({ message: `Successfully added ${processed} new products. ${ignored} items were skipped (duplicates or empty).` });
            } catch (error) {
                await connection.rollback();
                if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
                res.status(500).json({ error: error.message });
            } finally {
                connection.release();
            }
        });
});

router.post('/stock', upload.single('file'), async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const parseDateInput = (dateStr) => {
        if (!dateStr || typeof dateStr !== 'string') return dateStr;
        dateStr = dateStr.trim();
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const [d, m, y] = parts;
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        } else if (dateStr.includes('-') && dateStr.split('-')[0].length !== 4) {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const [d, m, y] = parts;
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }
        return dateStr;
    };

    const results = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            const connection = await db.getConnection();
            await connection.beginTransaction();

            try {
                // Group items by (date, consignment, bond_no) to create entry headers
                const groups = {};
                for (const row of results) {
                    // Normalize fields
                    row.be_no = row['be number'] || row.be_no || row.be_num;
                    row.bond_no = row['bond number'] || row.bond_no;
                    row.bond_date = parseDateInput(row['bond date'] || row.bond_date || row['bond dt'] || row.bond_dt || row.date);
                    row.bond_expiry = parseDateInput(row['bond expiry'] || row.bond_expiry);
                    row.expiry_1 = parseDateInput(row['initial expiry 1'] || row.expiry_1);
                    row.expiry_2 = parseDateInput(row['initial expiry 2'] || row.expiry_2);
                    row.expiry_3 = parseDateInput(row['initial expiry 3'] || row.expiry_3);
                    row.be_date = parseDateInput(row['be date'] || row.be_date || row.date);
                    row.min_stock = row['min stock'] || row.min_stock;
                    row.flight_no = row['flight no'] || row.flight_no || row.flight;
                    row.awb_no = row['awb no'] || row.awb_no || row.awb;
                    row.consignment = row.consignment || row.consignee || row.supplier;
                    
                    row.qty = parseFloat(row.balance || row.qty || 0);
                    
                    // Value Handling: The user clarified that 'unit value' and 'unit duty' headers in their CSV are actually TOTALS.
                    let totalValue = parseFloat(row['total value'] || row.total_value || row['unit value'] || row.unit_value || row.value || 0);
                    let unitValue = (totalValue > 0 && row.qty > 0) ? (totalValue / row.qty) : 0;
                    
                    console.log(`Row: ${row.description}, Qty: ${row.qty}, TotalValue: ${totalValue}, UnitValue: ${unitValue}`);

                    row.value = totalValue;
                    row.unit_value = unitValue;
                    
                    // Duty calculation
                    let dutyRateStr = (row['duty rate'] || row['duty percent'] || row.duty_rate || row.duty_percent || '').toString().trim();
                    let dutyRate = parseFloat(dutyRateStr.replace('%', '').trim()) || 0;
                    row.duty_rate = dutyRateStr; // Keep the original string (e.g., '150%+10%')
                    
                    let totalDuty = parseFloat(row['total duty'] || row.total_duty || row['unit duty'] || row.unit_duty || row.duty || 0);
                    let unitDuty = (totalDuty > 0 && row.qty > 0) ? (totalDuty / row.qty) : 0;
                    
                    console.log(`Row: ${row.description}, TotalDuty: ${totalDuty}, UnitDuty: ${unitDuty}`);

                    if (totalDuty === 0 && dutyRate > 0) {
                        totalDuty = (row.value * dutyRate) / 100;
                        unitDuty = totalDuty / row.qty;
                    }
                    
                    row.duty = totalDuty;
                    row.unit_duty = unitDuty;

                    // Check required fields
                    if (!row.bond_no || !row.bond_expiry || !row.description) {
                        continue; 
                    }

                    const key = `${row.be_date || ''}_${row.consignment || ''}_${row.bond_no}`;
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

                    // Calculate Header Totals
                    const totalQty = groupRows.reduce((sum, r) => sum + (parseFloat(r.qty) || 0), 0);
                    const totalValue = groupRows.reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0);
                    const totalDuty = groupRows.reduce((sum, r) => sum + (parseFloat(r.duty) || 0), 0);
                    const headerDutyRate = firstRow.duty_rate || null;

                    // 2. Create one inward entry (Header) for this group
                    const dateOfReceipt = firstRow.be_date || new Date().toISOString().split('T')[0];
                    const [entryResult] = await connection.query(`
                        INSERT INTO inward_entries (
                            be_no, be_date, bond_no, bond_date, date_of_receipt, 
                            consignment_id, branch_id, mode_of_receipt, warehouse_code,
                            qty_received, value, duty, duty_rate,
                            initial_bonding_expiry,
                            extended_bonding_expiry1, extended_bonding_expiry2, extended_bonding_expiry3,
                            flight_no, awb_no
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        firstRow.be_no || ('BULK-' + Date.now()), dateOfReceipt, 
                        firstRow.bond_no, firstRow.bond_date || dateOfReceipt,
                        dateOfReceipt, consignmentId, branch_id || null, 'BULK UPLOAD', 'Cok15003',
                        totalQty, totalValue, totalDuty, headerDutyRate,
                        firstRow.bond_expiry,
                        firstRow.expiry_1 || null, firstRow.expiry_2 || null, firstRow.expiry_3 || null,
                        firstRow.flight_no || null, firstRow.awb_no || null
                    ]);

                    const inwardId = entryResult.insertId;

                    // 3. Create inward items for this entry
                    for (const row of groupRows) {
                        // Find or create item and update its min_stock / code
                        let itemId = null;
                        const [items] = await connection.query('SELECT id FROM items WHERE description = ?', [row.description.trim()]);
                        
                        const hsn_code = row.code || row.hsn_code || row.hsn || null;
                        const min_stock = parseInt(row.min_stock) || 0;

                        if (items.length > 0) {
                            itemId = items[0].id;
                            await connection.query('UPDATE items SET min_stock = ?, hsn_code = ? WHERE id = ?', [min_stock, hsn_code, itemId]);
                        } else {
                            const [res] = await connection.query('INSERT INTO items (description, unit, min_stock, hsn_code) VALUES (?, ?, ?, ?)', 
                                [row.description.trim(), row.unit || 'PCS', min_stock, hsn_code]);
                            itemId = res.insertId;
                        }

                        await connection.query(`
                            INSERT INTO inward_items (
                                inward_id, item_id, description, qty, unit, 
                                value, duty, duty_percent, unit_value, unit_duty,
                                bond_no, bond_date, bond_expiry,
                                extended_bonding_expiry1, extended_bonding_expiry2, extended_bonding_expiry3
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            inwardId, itemId, row.description, 
                            row.qty, row.unit || 'PCS',
                            row.value, row.duty, row.duty_rate, row.unit_value, row.unit_duty,
                            row.bond_no, row.bond_date, row.bond_expiry,
                            row.expiry_1 || null, row.expiry_2 || null, row.expiry_3 || null
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
