const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// Login route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const db = req.app.locals.db;

    try {
        const [users] = await db.query('SELECT u.*, b.name as branch_name, b.code as branch_code FROM users u LEFT JOIN branches b ON u.branch_id = b.id WHERE u.username = ? AND u.status = "ACTIVE"', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Return user info and token placeholder
        res.json({
            token: 'cafs-session-' + Date.now(),
            user: {
                id: user.id,
                username: user.username,
                name: user.full_name,
                role: user.role,
                branch_id: user.branch_id,
                branch_name: user.branch_name,
                branch_code: user.branch_code
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all active users for auto-login (internal use)
router.get('/users', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [users] = await db.query(`
            SELECT u.id, u.username, u.full_name as name, u.role, b.name as branch_name 
            FROM users u 
            LEFT JOIN branches b ON u.branch_id = b.id 
            WHERE u.status = 'ACTIVE'
            ORDER BY u.role, u.username
        `);
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Auto-login bypass for internal use
router.post('/auto-login', async (req, res) => {
    const { userId } = req.body;
    const db = req.app.locals.db;
    try {
        const [users] = await db.query(`
            SELECT u.*, b.name as branch_name, b.code as branch_code 
            FROM users u 
            LEFT JOIN branches b ON u.branch_id = b.id 
            WHERE u.id = ? AND u.status = 'ACTIVE'`, [userId]);
            
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        
        const user = users[0];
        
        res.json({ 
            token: 'cafs-session-auto-' + Date.now(),
            user: {
                id: user.id,
                username: user.username,
                name: user.full_name,
                role: user.role,
                branch_id: user.branch_id,
                branch_name: user.branch_name,
                branch_code: user.branch_code
            } 
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
