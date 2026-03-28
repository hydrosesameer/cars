const express = require('express');
const router = express.Router();

// Get all countries
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [countries] = await db.query('SELECT * FROM countries ORDER BY name');
        res.json(countries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single country
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [countries] = await db.query('SELECT * FROM countries WHERE id = ?', [req.params.id]);
        if (countries.length === 0) return res.status(404).json({ error: 'Country not found' });
        res.json(countries[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create country
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { name, code, port_of_discharge } = req.body;
    try {
        if (!name || !code) throw new Error('Country name and code are required');
        const [result] = await db.query(
            'INSERT INTO countries (name, code, port_of_discharge) VALUES (?, ?, ?)',
            [name.trim(), code.trim().toUpperCase(), port_of_discharge || null]
        );
        res.json({ id: result.insertId, message: 'Country created successfully' });
    } catch (error) {
        res.status(error.message.includes('required') ? 400 : 500).json({ error: error.message });
    }
});

// Update country
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { name, code, port_of_discharge } = req.body;
    try {
        if (!name || !code) throw new Error('Country name and code are required');
        await db.query(
            'UPDATE countries SET name = ?, code = ?, port_of_discharge = ? WHERE id = ?',
            [name.trim(), code.trim().toUpperCase(), port_of_discharge || null, req.params.id]
        );
        res.json({ message: 'Country updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete country
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        await db.query('DELETE FROM countries WHERE id = ?', [req.params.id]);
        res.json({ message: 'Country deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
