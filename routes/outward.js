const express = require('express');
const router = express.Router();

// Get all outward entries
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [entries] = await db.query(`
            SELECT oe.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(oi.description) FROM outward_items oi WHERE oi.outward_id = oe.id) as items_list,
                   (SELECT bond_no FROM inward_entries ie WHERE ie.id = oe.inward_id) as inward_bond_no
            FROM outward_entries oe
            LEFT JOIN consignments c ON oe.consignment_id = c.id
            ORDER BY oe.dispatch_date DESC, oe.id DESC
        `);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all available inward items for dispatch (filterable by consignment)
// IMPORTANT: This route MUST come before /:id to avoid being matched as an id parameter
router.get('/available/items', async (req, res) => {
    const db = req.app.locals.db;
    const { consignment_id } = req.query;
    try {
        let query = `
            SELECT ii.id as inward_item_id, ii.inward_id, ii.description, ii.item_id, ii.value, ii.duty, ii.hsn_code, ii.qty as original_qty,
                   ie.bond_no, ie.consignment_id, ie.duty_rate,
                   ie.initial_bonding_expiry, 
                   ie.extended_bonding_expiry1, ie.extended_bonding_expiry2, ie.extended_bonding_expiry3,
                   ie.be_date, ie.be_no,
                   (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) + COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) as available_qty
            FROM inward_items ii
            JOIN inward_entries ie ON ii.inward_id = ie.id
            WHERE (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) + COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) > 0
        `;
        const params = [];
        if (consignment_id) {
            query += ' AND ie.consignment_id = ?';
            params.push(consignment_id);
        }
        
        query += ' ORDER BY ie.bond_no, ii.description';
        const [items] = await db.query(query, params);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single outward entry with items
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [entries] = await db.query(`
            SELECT oe.*, c.name as consignment_name 
            FROM outward_entries oe 
            LEFT JOIN consignments c ON oe.consignment_id = c.id 
            WHERE oe.id = ?
        `, [req.params.id]);
        
        if (entries.length === 0) return res.status(404).json({ error: 'Entry not found' });
        const entry = entries[0];
        
        const [items] = await db.query(`
            SELECT oi.*, ie.bond_no as bond_no, ii.description as item_description, ii.qty as original_qty
            FROM outward_items oi
            JOIN inward_entries ie ON oi.inward_id = ie.id
            JOIN inward_items ii ON oi.inward_item_id = ii.id
            WHERE oi.outward_id = ?
        `, [req.params.id]);
        
        res.json({ ...entry, items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new outward entry (Multi-Item)
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { 
        dispatch_date, flight_no, consignment_id, shipping_bill_no, shipping_bill_date,
        registration_no_of_means_of_transport, nature_of_removal, purpose, otl_no,
        remarks, items 
    } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('At least one item is required for dispatch');
        }

        if (!dispatch_date || !flight_no || !consignment_id) {
            throw new Error('Dispatch date, Flight No, and Consignment are mandatory');
        }

        for (const item of items) {
            const [stockRows] = await connection.query(`
                SELECT (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) + COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) as available,
                       ie.consignment_id
                FROM inward_items ii 
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE ii.id = ?
            `, [item.inward_item_id]);

            if (stockRows.length === 0) {
                throw new Error(`Item not found / Invalid ID: ${item.description} (ID: ${item.inward_item_id})`);
            }
            const stock = stockRows[0];
            
            if (stock.available < item.qty_dispatched) {
                throw new Error(`Insufficient stock for ${item.description || 'item'}. Available: ${stock.available}`);
            }
        }

        const totalQty = items.reduce((sum, i) => sum + (parseInt(i.qty_dispatched) || 0), 0);
        const totalValue = items.reduce((sum, i) => sum + ((parseFloat(i.value) || 0) * (parseInt(i.qty_dispatched) || 0)), 0);
        const totalDuty = items.reduce((sum, i) => sum + ((parseFloat(i.duty) || 0) * (parseInt(i.qty_dispatched) || 0)), 0);

        const primaryInwardId = items.length > 0 ? items[0].inward_id : null;

        const [result] = await connection.query(`
            INSERT INTO outward_entries (
                dispatch_date, flight_no, consignment_id, shipping_bill_no, shipping_bill_date,
                registration_no_of_means_of_transport, nature_of_removal, purpose, otl_no,
                total_dispatched, value, duty, remarks, inward_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            dispatch_date, flight_no, consignment_id || null, shipping_bill_no || null, shipping_bill_date || null,
            registration_no_of_means_of_transport || null, nature_of_removal || 'Re-export', purpose || 'Re-export', otl_no || null,
            totalQty, totalValue, totalDuty, remarks || null, primaryInwardId
        ]);

        const outwardId = result.insertId;

        for (const item of items) {
            await connection.query(`
                INSERT INTO outward_items (outward_id, inward_item_id, inward_id, item_id, description, qty_dispatched, value, duty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [outwardId, item.inward_item_id, item.inward_id, item.item_id || null, item.description, item.qty_dispatched, item.value, item.duty]);
        }

        await connection.commit();
        res.json({ id: outwardId, message: 'Outward dispatch created successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('mandatory') || error.message.includes('Insufficient') || error.message.includes('Item not found') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update outward item (for return as bag)
router.put('/:id/return', async (req, res) => {
    const db = req.app.locals.db;
    const { item_id, qty_returned_bag } = req.body;
    
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        await connection.query('UPDATE outward_items SET qty_returned_bag = ? WHERE id = ?', [qty_returned_bag, item_id]);
        
        await connection.query(`
            UPDATE outward_entries SET total_returned = (SELECT SUM(qty_returned_bag) FROM outward_items WHERE outward_id = ?)
            WHERE id = ?
        `, [req.params.id, req.params.id]);
        
        await connection.commit();
        res.json({ message: 'Return updated successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Delete outward entry
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        await connection.query('DELETE FROM outward_items WHERE outward_id = ?', [req.params.id]);
        await connection.query('DELETE FROM outward_entries WHERE id = ?', [req.params.id]);
        await connection.commit();
        res.json({ message: 'Outward entry deleted successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
