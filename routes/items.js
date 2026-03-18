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
    const { description, unit, hsn_code } = req.body;
    
    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }
    
    try {
        const [result] = await db.query(
            'INSERT INTO items (description, unit, hsn_code) VALUES (?, ?, ?)',
            [description, unit || 'PCS', hsn_code || null]
        );
        res.status(201).json({ id: result.insertId, description, unit: unit || 'PCS', hsn_code });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update item
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { description, unit, hsn_code } = req.body;
    
    try {
        await db.query(
            'UPDATE items SET description = ?, unit = ?, hsn_code = ? WHERE id = ?',
            [description, unit, hsn_code || null, req.params.id]
        );
        res.json({ id: parseInt(req.params.id), description, unit, hsn_code });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete item
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        await db.query('DELETE FROM items WHERE id = ?', [req.params.id]);
        res.json({ message: 'Item deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
