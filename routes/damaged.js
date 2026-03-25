const express = require('express');
const router = express.Router();

// Get all damaged items
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT di.*, ie.bond_no, ie.be_no, ii.description as item_description, c.name as consignment_name
            FROM damaged_items di
            JOIN inward_items ii ON di.inward_item_id = ii.id
            JOIN inward_entries ie ON ii.inward_id = ie.id
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        if (branch_id) {
            query += ' AND di.branch_id = ?';
            params.push(branch_id);
        }
        query += ' ORDER BY di.reported_date DESC';
        const [items] = await db.query(query, params);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Report bulk damaged items
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { items, reason, reported_date, remarks, reported_by, branch_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one item with a valid damage quantity is required' });
    }
    if (!branch_id) {
        return res.status(400).json({ error: 'Branch ID is required' });
    }
    if (!reported_by) {
        return res.status(400).json({ error: 'Reported by user ID is required' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        for (const item of items) {
            const { inward_item_id, qty_damaged } = item;
            
            if (!inward_item_id || !qty_damaged || qty_damaged <= 0) continue;

            // Validate stock
            const [stockRows] = await connection.query(`
                SELECT (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0)
                             - COALESCE((SELECT SUM(qty_damaged) FROM damaged_items WHERE inward_item_id = ii.id), 0)) as available,
                       ii.description, ii.inward_id
                FROM inward_items ii 
                WHERE ii.id = ?
            `, [inward_item_id]);

            if (stockRows.length === 0) {
                throw new Error('Item not found: ' + inward_item_id);
            }
            const stock = stockRows[0];
            
            if (stock.available < qty_damaged) {
                throw new Error(`Insufficient stock for ${stock.description}. Available: ${stock.available}`);
            }

            // Insert into damaged_items, including branch_id and reported_by
            await connection.query(`
                INSERT INTO damaged_items (inward_item_id, inward_id, qty_damaged, reason, reported_date, remarks, branch_id, reported_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [inward_item_id, stock.inward_id, qty_damaged, reason || 'Damaged', reported_date || new Date().toISOString().split('T')[0], remarks || null, branch_id, reported_by]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Damaged items reported successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Delete a damaged item report (reverts stock)
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        await db.query('DELETE FROM damaged_items WHERE id = ?', [req.params.id]);
        res.json({ message: 'Damage report deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
