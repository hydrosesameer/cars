const express = require('express');
const router = express.Router();

// Get all items
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [items] = await db.query('SELECT * FROM items ORDER BY description');
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single item
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [rows] = await db.query('SELECT * FROM items WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new item
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { description, unit, hsn_code, min_stock } = req.body;
    
    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }
    
    try {
        const [result] = await db.query(
            'INSERT INTO items (description, unit, hsn_code, min_stock) VALUES (?, ?, ?, ?)',
            [description, unit || 'PCS', hsn_code || null, min_stock || 0]
        );
        res.status(201).json({ id: result.insertId, description, unit: unit || 'PCS', hsn_code, min_stock });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update item
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { description, unit, hsn_code, min_stock } = req.body;
    
    try {
        await db.query(
            'UPDATE items SET description = ?, unit = ?, hsn_code = ?, min_stock = ? WHERE id = ?',
            [description, unit, hsn_code || null, min_stock || 0, req.params.id]
        );
        res.json({ id: parseInt(req.params.id), description, unit, hsn_code, min_stock });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete item
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const itemId = req.params.id;
    try {
        // Check if item has transactions
        const [inwardCount] = await db.query('SELECT COUNT(*) as count FROM inward_items WHERE item_id = ?', [itemId]);
        const [outwardCount] = await db.query('SELECT COUNT(*) as count FROM outward_items WHERE item_id = ?', [itemId]);
        const [damagedCount] = await db.query('SELECT COUNT(*) as count FROM damaged_items WHERE inward_item_id IN (SELECT id FROM inward_items WHERE item_id = ?)', [itemId]);
        
        const totalCount = (inwardCount[0].count || 0) + (outwardCount[0].count || 0) + (damagedCount[0].count || 0);

        if (totalCount > 0) {
            return res.status(400).json({ error: 'Cannot delete item. There are existing inward or outward transactions associated with this item.' });
        }

        await db.query('DELETE FROM items WHERE id = ?', [itemId]);
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            res.status(400).json({ error: 'Cannot delete item. It is being referenced by other records in the system.' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

module.exports = router;
