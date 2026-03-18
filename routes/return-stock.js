const express = require('express');
const router = express.Router();

// Get all return stock entries
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [entries] = await db.query(`
            SELECT rse.*, ie.bond_no, ii.description as item_description
            FROM return_stock_entries rse
            LEFT JOIN inward_entries ie ON rse.inward_id = ie.id
            LEFT JOIN inward_items ii ON rse.inward_item_id = ii.id
            ORDER BY rse.return_date DESC, rse.id DESC
        `);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new return stock entry
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { return_date, inward_id, inward_item_id, qty_returned, remarks, authorised_by } = req.body;

    if (!return_date || !inward_id || !inward_item_id || !qty_returned) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Verify qty available before returning (can only return up to what was dispatched)
        const [items] = await db.query(`
            SELECT ii.id, ii.qty, 
                   COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) as max_returnable
            FROM inward_items ii
            WHERE ii.id = ?
        `, [inward_item_id]);

        if (items.length === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (parseInt(qty_returned) > items[0].max_returnable) {
            return res.status(400).json({ error: `Return quantity (${qty_returned}) exceeds the amount dispatched (${items[0].max_returnable})` });
        }

        const [result] = await db.query(`
            INSERT INTO return_stock_entries (return_date, inward_id, inward_item_id, qty_returned, remarks, authorised_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [return_date, inward_id, inward_item_id, qty_returned, remarks, authorised_by]);

        res.json({ id: result.insertId, message: 'Return stock recorded successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
