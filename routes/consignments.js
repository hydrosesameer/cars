const express = require('express');
const router = express.Router();

// Get all consignments
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const { type } = req.query;
    
    try {
        let query = 'SELECT * FROM consignments';
        let params = [];
        
        if (type) {
            query += ' WHERE type = ?';
            params.push(type);
        }
        
        query += ' ORDER BY name';
        const [consignments] = await db.query(query, params);
        res.json(consignments);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single consignment
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [rows] = await db.query('SELECT * FROM consignments WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Consignment not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new consignment
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const { name, code, airline_code, address, type } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    try {
        const [result] = await db.query(
            'INSERT INTO consignments (name, code, airline_code, address, type) VALUES (?, ?, ?, ?, ?)',
            [name, code || null, airline_code || null, address || null, type || 'AIRLINE']
        );
        res.status(201).json({ id: result.insertId, name, code, airline_code, address, type: type || 'AIRLINE' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Consignment with this name already exists' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Update consignment
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { name, code, airline_code, address, type } = req.body;
    
    try {
        await db.query(
            'UPDATE consignments SET name = ?, code = ?, airline_code = ?, address = ?, type = ? WHERE id = ?',
            [name, code || null, airline_code || null, address || null, type, req.params.id]
        );
        res.json({ id: parseInt(req.params.id), name, code, airline_code, address, type });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete consignment
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        await db.query('DELETE FROM consignments WHERE id = ?', [req.params.id]);
        res.json({ message: 'Consignment deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
