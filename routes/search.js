const express = require('express');
const router = express.Router();

// Global Search API
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const { q, branch_id } = req.query;

    if (!q || q.length < 2) {
        return res.json({ results: [] });
    }

    try {
        const searchTerm = `%${q}%`;
        const params = [searchTerm, searchTerm, searchTerm];
        let branchFilter = branch_id ? ' AND branch_id = ?' : ' AND 1=1';
        let branchParams = branch_id ? [branch_id] : [];

        // 1. Search Inward Entries (Bond No, BE No)
        const [inwardRows] = await db.query(`
            SELECT id, 'INWARD' as type, bond_no as title, CONCAT('BE: ', be_no, ' | Date: ', date_of_receipt) as subtitle, 'inward.html' as url
            FROM inward_entries
            WHERE (bond_no LIKE ? OR be_no LIKE ?) ${branchFilter}
            LIMIT 5
        `, [searchTerm, searchTerm, ...branchParams]);

        // 2. Search Outward Entries (Shipping Bill No, Flight No)
        const [outwardRows] = await db.query(`
            SELECT id, 'OUTWARD' as type, shipping_bill_no as title, CONCAT('Flight: ', flight_no, ' | Date: ', dispatch_date) as subtitle, 'outward.html' as url
            FROM outward_entries
            WHERE (shipping_bill_no LIKE ? OR flight_no LIKE ?) ${branchFilter}
            LIMIT 5
        `, [searchTerm, searchTerm, ...branchParams]);

        // 3. Search Items (Description, Code)
        const [itemRows] = await db.query(`
            SELECT id, 'ITEM' as type, description as title, CONCAT('Code: ', IFNULL(code, 'N/A'), ' | Unit: ', unit) as subtitle, 'items.html' as url
            FROM items
            WHERE (description LIKE ? OR code LIKE ?)
            LIMIT 5
        `, [searchTerm, searchTerm]);

        // 4. Search Consignments (Name)
        const [consignmentRows] = await db.query(`
            SELECT id, 'CONSIGNMENT' as type, name as title, CONCAT('Code: ', code, ' | Type: ', type) as subtitle, 'consignments.html' as url
            FROM consignments
            WHERE name LIKE ?
            LIMIT 5
        `, [searchTerm]);

        const results = [
            ...inwardRows.map(r => ({ ...r, icon: 'fas fa-arrow-down' })),
            ...outwardRows.map(r => ({ ...r, icon: 'fas fa-arrow-up' })),
            ...itemRows.map(r => ({ ...r, icon: 'fas fa-wine-bottle' })),
            ...consignmentRows.map(r => ({ ...r, icon: 'fas fa-building' }))
        ];

        res.json({ results });
    } catch (error) {
        console.error('Search API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
