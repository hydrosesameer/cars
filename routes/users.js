const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// List all users
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [users] = await db.query(`
            SELECT u.id, u.username, u.full_name, u.role, u.branch_id, b.name as branch_name, u.status 
            FROM users u 
            LEFT JOIN branches b ON u.branch_id = b.id
        `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create user
router.post('/', async (req, res) => {
    const { username, password, full_name, role, branch_id } = req.body;
    const db = req.app.locals.db;
    try {
        const hash = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO users (username, password_hash, full_name, role, branch_id) VALUES (?, ?, ?, ?, ?)',
            [username, hash, full_name, role, branch_id || null]
        );
        res.status(201).json({ message: 'User created' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user
router.put('/:id', async (req, res) => {
    const { full_name, role, branch_id, status, password } = req.body;
    const db = req.app.locals.db;
    try {
        let query = 'UPDATE users SET full_name = ?, role = ?, branch_id = ?, status = ?';
        let params = [full_name, role, branch_id || null, status];
        
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            query += ', password_hash = ?';
            params.push(hash);
        }
        
        query += ' WHERE id = ?';
        params.push(req.params.id);
        
        await db.query(query, params);
        res.json({ message: 'User updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
