const express = require('express');
const router = express.Router();

const toSqlDate = (d) => d ? String(d).split('T')[0] : null;

// Get all inward entries
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const { bond_no, item_id, consignment_id, branch_id } = req.query;
    
    try {
        let query = `
            SELECT ie.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(ii.description) FROM inward_items ii WHERE ii.inward_id = ie.id) as items_list,
                   (SELECT SUM(ii.qty) FROM inward_items ii WHERE ii.inward_id = ie.id) as total_qty,
                   COALESCE((SELECT SUM(oi.qty_dispatched) FROM outward_items oi WHERE oi.inward_id = ie.id), 0) as total_dispatched,
                   COALESCE((SELECT SUM(oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_id = ie.id), 0) as total_returned,
                   COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di JOIN inward_items iid ON di.inward_item_id = iid.id WHERE iid.inward_id = ie.id), 0) as total_damaged,
                   ((SELECT SUM(ii.qty) FROM inward_items ii WHERE ii.inward_id = ie.id) - 
                    COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_id = ie.id), 0) -
                    COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di JOIN inward_items iid ON di.inward_item_id = iid.id WHERE iid.inward_id = ie.id), 0) +
                    COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse JOIN inward_items iid ON rse.inward_item_id = iid.id WHERE iid.inward_id = ie.id), 0)) as available_stock
            FROM inward_entries ie
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        
        if (bond_no) {
            query += ' AND ie.bond_no LIKE ?';
            params.push(`%${bond_no}%`);
        }
        if (consignment_id) {
            query += ' AND ie.consignment_id = ?';
            params.push(consignment_id);
        }
        if (branch_id) {
            query += ' AND ie.branch_id = ?';
            params.push(branch_id);
        }
        
        query += ' ORDER BY ie.date_of_receipt DESC, ie.id DESC';
        
        const [entries] = await db.query(query, params);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get a single inward entry with items
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT ie.*, c.name as consignment_name 
            FROM inward_entries ie 
            LEFT JOIN consignments c ON ie.consignment_id = c.id 
            WHERE ie.id = ?
        `;
        let params = [req.params.id];
        
        if (branch_id) {
            query += ' AND ie.branch_id = ?';
            params.push(branch_id);
        }
        
        const [entries] = await db.query(query, params);
        
        if (entries.length === 0) return res.status(404).json({ error: 'Entry not found or access denied' });
        const entry = entries[0];
        
        const [items] = await db.query(`
            SELECT ii.*, 
                   (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) -
                    COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) +
                    COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) as available_qty
            FROM inward_items ii 
            WHERE ii.inward_id = ?
        `, [req.params.id]);
        
        const [outwardHistory] = await db.query(`
            SELECT oe.*, 
                   (SELECT GROUP_CONCAT(oi.description) FROM outward_items oi WHERE oi.outward_id = oe.id) as items_list
            FROM outward_entries oe
            WHERE oe.id IN (SELECT outward_id FROM outward_items WHERE inward_id = ?)
            ORDER BY oe.dispatch_date DESC
        `, [req.params.id]);
        
        const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
        const availableStock = items.reduce((sum, i) => sum + i.available_qty, 0);
        
        res.json({ ...entry, items, outward_history: outwardHistory, total_qty: totalQty, available_stock: availableStock });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new inward entry (Billing Type - Multi-Item)
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const {
        be_no, be_date, customs_station, bond_no, bond_date, shipping_bill_no, shipping_bill_date,
        date_of_order_section_60, sl_no_import_invoice, consignment_id, warehouse_code,
        warehouse_address, transport_reg_no, otl_no, mode_of_receipt, qty_advised,
        date_of_receipt, initial_bonding_date, initial_bonding_expiry,
        extended_bonding_date1, extended_bonding_expiry1, extended_bonding_date2, extended_bonding_expiry2,
        extended_bonding_date3, extended_bonding_expiry3, bank_guarantee, relinquishment,
        duty_rate, value_rate, remarks, items, branch_id, flight_no
    } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('At least one item is required');
        }

        const totalQty = items.reduce((sum, i) => sum + (parseInt(i.qty) || 0), 0);
        const totalValue = items.reduce((sum, i) => sum + (parseFloat(i.value) || 0), 0);
        const totalDuty = items.reduce((sum, i) => sum + (parseFloat(i.duty) || 0), 0);

        if (!be_no || !be_date || !bond_no || !date_of_receipt) {
            throw new Error('BE No, BE Date, Bond No, and Receipt Date are mandatory');
        }

        const [result] = await connection.query(`
            INSERT INTO inward_entries (
                be_no, be_date, customs_station, bond_no, bond_date, shipping_bill_no, shipping_bill_date,
                date_of_order_section_60, sl_no_import_invoice, consignment_id, warehouse_code,
                warehouse_address, transport_reg_no, otl_no, mode_of_receipt, qty_advised,
                qty_received, date_of_receipt, initial_bonding_date, initial_bonding_expiry,
                extended_bonding_date1, extended_bonding_expiry1, extended_bonding_date2, extended_bonding_expiry2,
                extended_bonding_date3, extended_bonding_expiry3, bank_guarantee, relinquishment,
            duty_rate, value_rate, remarks, value, duty, branch_id, flight_no
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        be_no, toSqlDate(be_date), customs_station || 'COK', bond_no, toSqlDate(bond_date), shipping_bill_no || null, toSqlDate(shipping_bill_date),
        toSqlDate(date_of_order_section_60), sl_no_import_invoice || null, consignment_id || null, warehouse_code || 'Cok15003',
        warehouse_address || 'Nayathode P.O Angamali Kerala 683572', transport_reg_no || null, otl_no || null, mode_of_receipt || 'AIRLINE', qty_advised || totalQty,
        totalQty, toSqlDate(date_of_receipt), toSqlDate(initial_bonding_date), toSqlDate(initial_bonding_expiry),
        toSqlDate(extended_bonding_date1), toSqlDate(extended_bonding_expiry1), toSqlDate(extended_bonding_date2), toSqlDate(extended_bonding_expiry2),
        toSqlDate(extended_bonding_date3), toSqlDate(extended_bonding_expiry3), bank_guarantee || 'NA', relinquishment || 0,
        duty_rate || null, value_rate || null, remarks || null, totalValue, totalDuty, branch_id || null, flight_no || null
    ]);

        const inwardId = result.insertId;

        for (const item of items) {
            await connection.query(`
                INSERT INTO inward_items (inward_id, item_id, description, qty, unit, value, duty, hsn_code, shelf_life_date, duty_percent, bond_no, bond_date, bond_expiry)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [inwardId, item.item_id || null, item.description, item.qty, item.unit || 'PCS', item.value, item.duty, item.hsn_code || null, item.shelf_life_date ? String(item.shelf_life_date).split('T')[0] : null, item.duty_percent || null, item.bond_no || null, item.bond_date ? String(item.bond_date).split('T')[0] : null, item.bond_expiry ? String(item.bond_expiry).split('T')[0] : null]);
        }

        await connection.commit();
        res.json({ id: inwardId, message: 'Inward entry created successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('mandatory') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update inward entry
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const inwardId = req.params.id;
    const { items, ...header } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        console.log(`[PUT /inward/${inwardId}] Request Body:`, JSON.stringify(req.body, null, 2));

        const totalQty = items.reduce((sum, i) => sum + (parseInt(i.qty) || 0), 0);
        const totalValue = items.reduce((sum, i) => sum + (parseFloat(i.value) || 0), 0);
        const totalDuty = items.reduce((sum, i) => sum + (parseFloat(i.duty) || 0), 0);

        await connection.query(`
            UPDATE inward_entries SET
                be_no = ?, be_date = ?, customs_station = ?, bond_no = ?, bond_date = ?, 
                shipping_bill_no = ?, shipping_bill_date = ?, date_of_order_section_60 = ?, 
                sl_no_import_invoice = ?, consignment_id = ?, warehouse_code = ?,
                warehouse_address = ?, transport_reg_no = ?, otl_no = ?, mode_of_receipt = ?, 
                qty_advised = ?, qty_received = ?, date_of_receipt = ?, 
                initial_bonding_date = ?, initial_bonding_expiry = ?,
                extended_bonding_date1 = ?, extended_bonding_expiry1 = ?, 
                extended_bonding_date2 = ?, extended_bonding_expiry2 = ?,
                extended_bonding_date3 = ?, extended_bonding_expiry3 = ?, 
                bank_guarantee = ?, relinquishment = ?,
                duty_rate = ?, value_rate = ?, remarks = ?, value = ?, duty = ?, flight_no = ?
            WHERE id = ?
        `, [
            header.be_no, toSqlDate(header.be_date), header.customs_station, header.bond_no, toSqlDate(header.bond_date),
            header.shipping_bill_no || null, toSqlDate(header.shipping_bill_date), toSqlDate(header.date_of_order_section_60),
            header.sl_no_import_invoice || null, header.consignment_id || null, header.warehouse_code || 'Cok15003',
            header.warehouse_address || 'Nayathode P.O Angamali Kerala 683572', header.transport_reg_no || null, header.otl_no || null, header.mode_of_receipt || 'AIRLINE',
            header.qty_advised || totalQty, totalQty, toSqlDate(header.date_of_receipt),
            toSqlDate(header.initial_bonding_date), toSqlDate(header.initial_bonding_expiry),
            toSqlDate(header.extended_bonding_date1), toSqlDate(header.extended_bonding_expiry1),
            toSqlDate(header.extended_bonding_date2), toSqlDate(header.extended_bonding_expiry2),
            toSqlDate(header.extended_bonding_date3), toSqlDate(header.extended_bonding_expiry3),
            header.bank_guarantee || 'NA', header.relinquishment || 0,
            header.duty_rate || null, header.value_rate || null, header.remarks || null, totalValue, totalDuty, header.flight_no || null,
            inwardId
        ]);

        const [currentItems] = await connection.query('SELECT id FROM inward_items WHERE inward_id = ?', [inwardId]);
        const currentIds = new Set(currentItems.map(i => parseInt(i.id)));
        const processedIds = new Set();

        for (const item of items) {
            const itemId = item.id ? parseInt(item.id) : null;
            if (itemId && currentIds.has(itemId)) {
                await connection.query(`
                    UPDATE inward_items SET 
                        item_id = ?, description = ?, qty = ?, unit = ?, value = ?, duty = ?, hsn_code = ?, shelf_life_date = ?, duty_percent = ?, bond_no = ?, bond_date = ?, bond_expiry = ?
                    WHERE id = ?
                `, [item.item_id || null, item.description, item.qty, item.unit || 'PCS', item.value, item.duty, item.hsn_code || null, item.shelf_life_date ? String(item.shelf_life_date).split('T')[0] : null, item.duty_percent || null, item.bond_no || null, item.bond_date ? String(item.bond_date).split('T')[0] : null, item.bond_expiry ? String(item.bond_expiry).split('T')[0] : null, item.id]);
                processedIds.add(itemId);
            } else {
                await connection.query(`
                    INSERT INTO inward_items (inward_id, item_id, description, qty, unit, value, duty, hsn_code, shelf_life_date, duty_percent, bond_no, bond_date, bond_expiry)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [inwardId, item.item_id || null, item.description, item.qty, item.unit || 'PCS', item.value, item.duty, item.hsn_code || null, item.shelf_life_date ? String(item.shelf_life_date).split('T')[0] : null, item.duty_percent || null, item.bond_no || null, item.bond_date ? String(item.bond_date).split('T')[0] : null, item.bond_expiry ? String(item.bond_expiry).split('T')[0] : null]);
            }
        }

        for (const id of currentIds) {
            if (!processedIds.has(id)) {
                await connection.query('DELETE FROM inward_items WHERE id = ?', [id]);
            }
        }

        await connection.commit();
        res.json({ message: 'Inward entry updated successfully' });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
             res.status(400).json({ error: 'Cannot delete items that have been dispatched/used.' });
        } else {
             res.status(500).json({ error: error.message });
        }
    } finally {
        connection.release();
    }
});

// Get stock for specific inward entry items
router.get('/:id/stock', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [items] = await db.query(`
            SELECT ii.id, ii.item_id, ii.description, ii.qty, 
                   (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) -
                    COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) +
                    COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) as available
            FROM inward_items ii
            WHERE ii.inward_id = ?
        `, [req.params.id]);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
