const express = require('express');
const router = express.Router();

// List all branches
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [rows] = await db.query('SELECT * FROM branches');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create branch
router.post('/', async (req, res) => {
    const { name, code, airport_code, address, shipping_place } = req.body;
    const db = req.app.locals.db;
    try {
        await db.query(
            'INSERT INTO branches (name, code, airport_code, address, shipping_place) VALUES (?, ?, ?, ?, ?)',
            [name, code, airport_code || null, address, shipping_place || null]
        );
        res.status(201).json({ message: 'Branch created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update branch
router.put('/:id', async (req, res) => {
    const { name, code, airport_code, address, shipping_place, status } = req.body;
    const db = req.app.locals.db;
    try {
        await db.query(
            'UPDATE branches SET name = ?, code = ?, airport_code = ?, address = ?, shipping_place = ?, status = ? WHERE id = ?',
            [name, code, airport_code || null, address, shipping_place || null, status, req.params.id]
        );
        res.json({ message: 'Branch updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
