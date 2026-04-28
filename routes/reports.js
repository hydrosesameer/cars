const express = require('express');
const router = express.Router();

// Form-A: Item-wise ledger report
router.get('/form-a', async (req, res) => {
    const db = req.app.locals.db;
    const { item_id, bond_no, from_date, to_date, branch_id, consignment_id } = req.query;
    
    try {
        let query = `
            SELECT ii.id as inward_item_id, ii.description, ii.qty as qty_received, ii.value, ii.duty, ii.unit, ie.pkg_marks,
                   ie.pkg_description, ie.transport_reg_no, ie.otl_no, ie.qty_advised, ie.breakage_shortage,
                   ie.bank_guarantee, ie.relinquishment, ie.value_rate, ie.duty_rate,
                   ie.be_no, ie.be_date, 
                   COALESCE(ii.bond_no, ie.bond_no) as bond_no, 
                   COALESCE(ii.bond_date, ie.bond_date) as bond_date,
                   ie.shipping_bill_no as in_sb_no, ie.shipping_bill_date as in_sb_date,
                   ie.date_of_order_section_60, ie.date_of_receipt, ie.warehouse_code, ie.warehouse_address, ie.customs_station,
                   ie.initial_bonding_expiry, ie.extended_bonding_expiry1,
                   c.name as consignment_name
            FROM inward_items ii
            JOIN inward_entries ie ON ii.inward_id = ie.id
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        
        if (item_id) {
            const [[itemRecord]] = await db.query('SELECT description FROM items WHERE id = ?', [item_id]);
            const itemDesc = itemRecord ? itemRecord.description : null;

            if (itemDesc) {
                query += ' AND (ii.item_id = ? OR ii.item_id = ? OR ii.description = ?)'; 
                params.push(parseInt(item_id));
                params.push(parseInt(item_id).toString());
                params.push(itemDesc);
            } else {
                query += ' AND (ii.item_id = ? OR ii.item_id = ?)'; 
                params.push(parseInt(item_id));
                params.push(parseInt(item_id).toString());
            }
        }
        if (bond_no) {
            query += ' AND COALESCE(ii.bond_no, ie.bond_no) LIKE ?';
            params.push(`%${bond_no}%`);
        }
        if (from_date) {
            query += ' AND ie.date_of_receipt >= ?';
            params.push(from_date);
        }
        if (to_date) {
            query += ' AND ie.date_of_receipt <= ?';
            params.push(to_date);
        }
        if (branch_id) {
            query += ' AND ie.branch_id = ?';
            params.push(branch_id);
        }
        if (consignment_id) {
            query += ' AND ie.consignment_id = ?';
            params.push(consignment_id);
        }
        
        query += ' ORDER BY ie.date_of_receipt, ie.id';
        
        const [entries] = await db.query(query, params);
        
        // For each inward item, fetch all transactions (outward, damaged, return) separately
        const result = [];
        for (const entry of entries) {
            const itemId = entry.inward_item_id;
            
            // Fetch outward transactions
            const [outwards] = await db.query(`
                SELECT 'outward' as type, oe.id, oe.dispatch_date as date, oi.qty_dispatched as qty,
                       IFNULL(oe.shipping_bill_no, '') as ref, oe.purpose, oi.value, oi.duty
                FROM outward_items oi
                JOIN outward_entries oe ON oi.outward_id = oe.id
                WHERE oi.inward_item_id = ?
                ORDER BY oe.dispatch_date, oi.id
            `, [itemId]);
            
            // Fetch damaged transactions
            const [damaged] = await db.query(`
                SELECT 'damaged' as type, di.id, di.reported_date as date, di.qty_damaged as qty,
                       'DAMAGED' as ref, 'Damage/Breakage' as purpose, 0 as value, 0 as duty
                FROM damaged_items di
                WHERE di.inward_item_id = ?
                ORDER BY di.reported_date, di.id
            `, [itemId]);
            
            // Fetch return transactions
            const [returns] = await db.query(`
                SELECT 'return' as type, rse.id, rse.return_date as date, -(rse.qty_returned) as qty,
                       'RETURN' as ref, IFNULL(rse.remarks, 'Returned') as purpose, 0 as value, 0 as duty
                FROM return_stock_entries rse
                WHERE rse.inward_item_id = ?
                ORDER BY rse.return_date, rse.id
            `, [itemId]);
            
            // Merge and sort all transactions chronologically
            const allTransactions = [...outwards, ...damaged, ...returns]
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            const totalDispatched = allTransactions.reduce((sum, o) => sum + Number(o.qty || 0), 0);
            
            result.push({
                ...entry,
                outward_entries: allTransactions,
                total_dispatched: totalDispatched,
                qty_in_stock: entry.qty_received - totalDispatched
            });
        }
        
        res.json({
            report_type: 'FORM-A',
            report_title: 'Form to be maintained by the warehouse licensee of the goods handling, storing and removal of the warehoused goods',
            warehouse_code: 'Cok15003',
            warehouse_name: 'M/s. Casino Air Caterers & Flight Services (Unit Of Anjali Hotels) Nayathode P.O Angamali Kerala 683572',
            generated_at: new Date().toISOString(),
            entries: result
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Form-B: Monthly summary of items with bonding expiry
router.get('/form-b', async (req, res) => {
    const db = req.app.locals.db;
    const { month, year, branch_id, consignment_id } = req.query;
    
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    // Last day of the target month
    const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];
    
    try {
        // 1. Fetch branch info
        let warehouse_code = 'Cok15173';
        let warehouse_name = 'M/s. Casino Air Caterers & Flight Services (Unit Of Anjali Hotels) Nayathode P.O Angamali Kerala 683572';
        
        if (branch_id) {
            const [branches] = await db.query("SELECT * FROM branches WHERE id = ?", [branch_id]);
            if (branches.length > 0) {
                warehouse_code = branches[0].code || warehouse_code;
                warehouse_name = `${branches[0].name} Warehouse`;
            }
        }

        // 2. Main query for monthly closing stock - Aggregate by Airline (Consignment)
        let query = `
            SELECT * FROM (
                SELECT c.name as consignment_name,
                    ii.qty as total_qty_received,
                    (ii.qty - COALESCE(
                        (SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) 
                         FROM outward_items oi 
                         JOIN outward_entries oe ON oi.outward_id = oe.id 
                         WHERE oi.inward_item_id = ii.id AND oe.dispatch_date <= ?), 0
                    ) - COALESCE(
                        (SELECT SUM(di.qty_damaged) 
                         FROM damaged_items di 
                         WHERE di.inward_item_id = ii.id AND di.created_at <= ?), 0
                    ) + COALESCE(
                        (SELECT SUM(rse.qty_returned) 
                         FROM return_stock_entries rse 
                         WHERE rse.inward_item_id = ii.id AND rse.created_at <= ?), 0
                    )) as qty_in_stock,
                    ii.value as total_value,
                    ie.be_no as be_no,
                    ie.be_date as be_date,
                    COALESCE(ii.bond_no, ie.bond_no) as bond_no,
                    ie.date_of_order_section_60 as date_of_order_section_60,
                    ie.sl_no_import_invoice as sl_no_import_invoice,
                    COALESCE(ii.bond_expiry, ie.initial_bonding_expiry) as initial_bonding_expiry,
                    COALESCE(ii.extended_bonding_expiry1, ie.extended_bonding_expiry1) as extended_bonding_expiry1,
                    COALESCE(ii.extended_bonding_expiry2, ie.extended_bonding_expiry2) as extended_bonding_expiry2,
                    COALESCE(ii.extended_bonding_expiry3, ie.extended_bonding_expiry3) as extended_bonding_expiry3,
                    COALESCE(ii.unit_value, ie.value_rate) as value_rate,
                    ii.description as description,
                    ii.description as remarks
                FROM inward_items ii
                JOIN inward_entries ie ON ii.inward_id = ie.id
                LEFT JOIN consignments c ON ie.consignment_id = c.id
                WHERE ie.date_of_receipt <= ?
            `;
        
        let params = [endDate, endDate + ' 23:59:59', endDate + ' 23:59:59', endDate];
        
        if (branch_id) {
            query += ` AND ie.branch_id = ?`;
            params.push(branch_id);
        }
        
        if (consignment_id) {
            query += ` AND ie.consignment_id = ?`;
            params.push(consignment_id);
        }
        
        query += ` ) as stock WHERE qty_in_stock > 0 ORDER BY consignment_name, description`;

        const [entries] = await db.query(query, params);
        
        // Group by consignment
        const grouped = {};
        entries.forEach(entry => {
            const key = entry.consignment_name || 'Unknown';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(entry);
        });
        
        const monthNames = ['', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 
                           'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
        
        res.json({
            report_type: 'FORM-B',
            report_title: `FORM-B - MONTHLY CLOSING STOCK - ${monthNames[targetMonth]} ${targetYear}`,
            subtitle: 'Airline-wise details of goods stored in the warehouse.',
            circular_ref: 'In terms of Circular No 25/2016-Customs dated 08.06.2016',
            warehouse_code,
            warehouse_name,
            month: targetMonth,
            year: targetYear,
            generated_at: new Date().toISOString(),
            grouped_entries: grouped,
            total_entries: entries.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register report (Inward/Outward)
router.get('/register', async (req, res) => {
    const db = req.app.locals.db;
    const { type, from_date, to_date, consignment_id } = req.query;
    
    try {
        if (type === 'outward') {
            let query = `
                SELECT oe.*, c.name as consignment_name,
                       (SELECT GROUP_CONCAT(oi.description) FROM outward_items oi WHERE oi.outward_id = oe.id) as items_list
                FROM outward_entries oe
                LEFT JOIN consignments c ON oe.consignment_id = c.id
                WHERE 1=1
            `;
            let params = [];
            
            if (from_date) {
                query += ' AND oe.dispatch_date >= ?';
                params.push(from_date);
            }
            if (to_date) {
                query += ' AND oe.dispatch_date <= ?';
                params.push(to_date);
            }
            if (consignment_id) {
                query += ' AND oe.consignment_id = ?';
                params.push(consignment_id);
            }
            
            query += ' ORDER BY oe.dispatch_date DESC, oe.id DESC';
            const [entries] = await db.query(query, params);
            
            res.json({
                report_type: 'OUTWARD_REGISTER',
                report_title: 'Outward Dispatch Register',
                entries
            });
        } else {
            let query = `
                SELECT ie.*, c.name as consignment_name,
                       (SELECT GROUP_CONCAT(ii.description) FROM inward_items ii WHERE ii.inward_id = ie.id) as items_list,
                       (SELECT SUM(ii.qty) FROM inward_items ii WHERE ii.inward_id = ie.id) as total_qty,
                       ((SELECT SUM(ii.qty) FROM inward_items ii WHERE ii.inward_id = ie.id) - 
                        COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_id = ie.id), 0) -
                        COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di JOIN inward_items iid ON di.inward_item_id = iid.id WHERE iid.inward_id = ie.id), 0)) as current_stock
                FROM inward_entries ie
                LEFT JOIN consignments c ON ie.consignment_id = c.id
                WHERE 1=1
            `;
            let params = [];
            
            if (from_date) {
                query += ' AND ie.date_of_receipt >= ?';
                params.push(from_date);
            }
            if (to_date) {
                query += ' AND ie.date_of_receipt <= ?';
                params.push(to_date);
            }
            if (consignment_id) {
                query += ' AND ie.consignment_id = ?';
                params.push(consignment_id);
            }
            
            query += ' ORDER BY ie.date_of_receipt DESC, ie.id DESC';
            const [entries] = await db.query(query, params);
            
            res.json({
                report_type: 'INWARD_REGISTER',
                report_title: 'Inward Receipt Register',
                entries
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Consignment-wise Stock Report
router.get('/consignment-wise', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const query = `
            SELECT c.name as consignment_name, c.code as consignment_code,
                   COUNT(DISTINCT ie.id) as total_inwards,
                   SUM(ii.qty) as total_received,
                   COALESCE(SUM(oi_agg.dispatched), 0) as total_dispatched,
                   (SUM(ii.qty) - COALESCE(SUM(oi_agg.dispatched), 0) - COALESCE(SUM(di_agg.damaged), 0)) as stock_balance,
                   SUM(ii.value) as total_value,
                   SUM(ii.duty) as total_duty
            FROM consignments c
            JOIN inward_entries ie ON ie.consignment_id = c.id
            JOIN inward_items ii ON ii.inward_id = ie.id
            LEFT JOIN (
                SELECT inward_item_id, SUM(qty_dispatched - qty_returned_bag) as dispatched
                FROM outward_items
                GROUP BY inward_item_id
            ) oi_agg ON oi_agg.inward_item_id = ii.id
            LEFT JOIN (
                SELECT inward_item_id, SUM(qty_damaged) as damaged
                FROM damaged_items
                GROUP BY inward_item_id
            ) di_agg ON di_agg.inward_item_id = ii.id
            GROUP BY c.id
            HAVING stock_balance > 0
            ORDER BY c.name
        `;
        const [entries] = await db.query(query);
        res.json({
            report_title: 'Consignment-wise Inventory Summary',
            generated_at: new Date().toISOString(),
            entries
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unique bond numbers for filters
router.get('/unique-bond-numbers', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = 'SELECT DISTINCT COALESCE(ii.bond_no, ie.bond_no) as bond_no FROM inward_items ii JOIN inward_entries ie ON ii.inward_id = ie.id WHERE 1=1';
        const params = [];
        if (branch_id) {
            query += ' AND ie.branch_id = ?';
            params.push(branch_id);
        }
        query += ' ORDER BY bond_no ASC';
        const [rows] = await db.query(query, params);
        res.json(rows.map(r => r.bond_no));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Extension Status (Apply or Approved)
router.put('/update-extension-status', async (req, res) => {
    const db = req.app.locals.db;
    const { inward_item_id, status } = req.body;

    if (!inward_item_id || !status) {
        return res.status(400).json({ error: 'inward_item_id and status are required' });
    }

    try {
        await db.query('UPDATE inward_items SET extension_status = ? WHERE id = ?', [status, inward_item_id]);
        res.json({ message: `Extension status updated to ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Expiry Alerts for Dashboard
router.get('/expiry-alerts', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT * FROM (
                SELECT ii.id, ii.inward_id, ii.description, ii.qty, ii.extension_status, 
                       ie.be_no, ie.be_date, 
                       COALESCE(ii.bond_no, ie.bond_no) as bond_no,
                       c.airline_code,
                       c.name as airline_name,
                       
                       ie.extended_bonding_expiry3,
                       ie.extended_bonding_expiry2,
                       ie.extended_bonding_expiry1,
                       ie.initial_bonding_expiry,
                       
                       -- Determine Active Expiry Date (Item level first, then entry level fallback)
                       COALESCE(
                           ii.extended_bonding_expiry3,
                           ii.extended_bonding_expiry2,
                           ii.extended_bonding_expiry1,
                           ii.bond_expiry, 
                           ie.extended_bonding_expiry3,
                           ie.extended_bonding_expiry2, 
                           ie.extended_bonding_expiry1, 
                           ie.initial_bonding_expiry
                       ) as active_expiry,
                       
                       -- Calculate Days Left
                       DATEDIFF(
                           COALESCE(
                               ii.extended_bonding_expiry3,
                               ii.extended_bonding_expiry2,
                               ii.extended_bonding_expiry1,
                               ii.bond_expiry, 
                               ie.extended_bonding_expiry3,
                               ie.extended_bonding_expiry2, 
                               ie.extended_bonding_expiry1, 
                               ie.initial_bonding_expiry
                           ), CURDATE()
                       ) as days_left,

                       -- Calculate Balance Quantity
                       (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0)
                              - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0)) as available_qty
                FROM inward_items ii
                JOIN inward_entries ie ON ii.inward_id = ie.id
                LEFT JOIN consignments c ON ie.consignment_id = c.id
                WHERE 1 = 1
                ${branch_id ? `AND ie.branch_id = ${parseInt(branch_id)}` : ''}
            ) as stock_calc
            WHERE available_qty > 0 
              AND active_expiry IS NOT NULL 
              AND extended_bonding_expiry3 IS NULL
              AND (
                  (days_left BETWEEN 90 AND 100)
                  OR 
                  (days_left < 0)
              )
            ORDER BY days_left ASC
        `;
        const [entries] = await db.query(query);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Detailed Stock Report
router.get('/stock-report', async (req, res) => {
    const db = req.app.locals.db;
    const { consignment_id, item_id, bond_no, from_date, to_date, expiry_date, branch_id } = req.query;
    try {
        let query = `
            SELECT * FROM (
                SELECT ii.id, ii.inward_id, ii.item_id, ii.description, ii.qty, ii.unit, ii.value, ii.duty, 
                       ii.qty_out, ii.bond_expiry as item_bond_expiry, ii.unit_value, ii.value_amount, 
                       ii.unit_duty, ii.duty_amount, ii.hsn_code, ii.shelf_life_date, ii.duty_percent,
                       ie.be_no, ie.be_date, 
                       COALESCE(ii.bond_no, ie.bond_no) as bond_no,
                       COALESCE(ii.bond_date, ie.bond_date) as bond_date,
                       ie.initial_bonding_expiry, ie.date_of_receipt,
                       ie.extended_bonding_expiry1, ie.extended_bonding_expiry2, ie.extended_bonding_expiry3,
                       ie.consignment_id, ie.branch_id,
                       c.name as consignment_name,
                       (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0)
                              - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0)) as available_qty
                FROM inward_items ii
                JOIN inward_entries ie ON ii.inward_id = ie.id
                LEFT JOIN consignments c ON ie.consignment_id = c.id
            ) as stock_calc
            WHERE available_qty > 0
        `;
        const params = [];
        if (consignment_id) {
            query += ' AND consignment_id = ?';
            params.push(consignment_id);
        }
        if (item_id) {
            query += ' AND item_id = ?';
            params.push(item_id);
        }
        if (bond_no) {
            query += ' AND bond_no LIKE ?';
            params.push('%' + bond_no + '%');
        }
        if (from_date) {
            query += ' AND date_of_receipt >= ?';
            params.push(from_date);
        }
        if (to_date) {
            query += ' AND date_of_receipt <= ?';
            params.push(to_date);
        }
        if (expiry_date) {
            query += ' AND (initial_bonding_expiry = ? OR extended_bonding_expiry1 = ? OR extended_bonding_expiry2 = ? OR extended_bonding_expiry3 = ?)';
            params.push(expiry_date, expiry_date, expiry_date, expiry_date);
        }
        if (branch_id) {
            query += ' AND branch_id = ?';
            params.push(branch_id);
        }
        
        query += ' ORDER BY initial_bonding_expiry ASC';
        const [entries] = await db.query(query, params);
        
        res.json({
            report_title: 'Current Stock Inventory Report',
            generated_at: new Date().toISOString(),
            entries
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Stock Expiries (Bond Expiries and Extended Expiries)
router.put('/update-expiries', async (req, res) => {
    const db = req.app.locals.db;
    const { 
        inward_item_id, inward_id, 
        bond_expiry, 
        initial_bonding_expiry, 
        extended_bonding_expiry1, 
        extended_bonding_expiry2, 
        extended_bonding_expiry3 
    } = req.body;

    if (!inward_item_id || !inward_id) {
        return res.status(400).json({ error: 'inward_item_id and inward_id are required' });
    }

    try {
        await db.query('START TRANSACTION');

        // Update item-level bond expiry and its extensions
        let itemQuery = `
            UPDATE inward_items 
            SET bond_expiry = ?,
                extended_bonding_expiry1 = ?,
                extended_bonding_expiry2 = ?,
                extended_bonding_expiry3 = ?
            WHERE id = ?`;
        await db.query(itemQuery, [
            bond_expiry || null, 
            extended_bonding_expiry1 || null,
            extended_bonding_expiry2 || null,
            extended_bonding_expiry3 || null,
            inward_item_id
        ]);

        // Update entry-level expiries (affects all items in this entry)
        let entryQuery = `
            UPDATE inward_entries 
            SET initial_bonding_expiry = ?, 
                extended_bonding_expiry1 = ?, 
                extended_bonding_expiry2 = ?, 
                extended_bonding_expiry3 = ? 
            WHERE id = ?`;
        await db.query(entryQuery, [
            initial_bonding_expiry || null,
            extended_bonding_expiry1 || null,
            extended_bonding_expiry2 || null,
            extended_bonding_expiry3 || null,
            inward_id
        ]);

        await db.query('COMMIT');
        res.json({ message: 'Expiries updated successfully' });
    } catch (error) {
        await db.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    }
});

// Ledger Report (Individual Bond/Item history)
router.get('/ledger', async (req, res) => {
    const db = req.app.locals.db;
    const { type, id } = req.query; // type: 'bond' or 'item', id: bond_no or item_id
    
    if (!type || !id || id === 'undefined') {
        return res.status(400).json({ error: 'Valid type and id are required' });
    }
    
    try {
        let query = '';
        let params = [];

        if (type === 'bond') {
            query = `
                SELECT 'INWARD' as txn_type, ie.date_of_receipt as date, ii.qty as qty, c.name as reference, 'Initial Bonding' as remarks
                FROM inward_items ii
                JOIN inward_entries ie ON ii.inward_id = ie.id
                LEFT JOIN consignments c ON ie.consignment_id = c.id
                WHERE COALESCE(ii.bond_no, ie.bond_no) = ?
                
                UNION ALL
                
                SELECT 'OUTWARD' as txn_type, oe.dispatch_date as date, oi.qty_dispatched as qty, oe.nature_of_removal as reference, oe.shipping_bill_no as remarks
                FROM outward_items oi
                JOIN outward_entries oe ON oi.outward_id = oe.id
                JOIN inward_items ii ON oi.inward_item_id = ii.id
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE COALESCE(ii.bond_no, ie.bond_no) = ?
                
                UNION ALL
                
                SELECT 'DAMAGED' as txn_type, di.reported_date as date, di.qty_damaged as qty, di.reason as reference, 'Damage deduction' as remarks
                FROM damaged_items di
                JOIN inward_items ii ON di.inward_item_id = ii.id
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE COALESCE(ii.bond_no, ie.bond_no) = ?
                
                UNION ALL
                
                SELECT 'RETURNED' as txn_type, re.return_date as date, re.qty_returned as qty, re.remarks as reference, re.authorised_by as remarks
                FROM return_stock_entries re
                JOIN inward_entries ie ON re.inward_id = ie.id
                WHERE ie.bond_no = ?
                
                ORDER BY date ASC
            `;
            params = [id, id, id, id];
        } else if (type === 'item') {
            const itemId = parseInt(id, 10);
            query = `
                SELECT 'INWARD' as txn_type, ie.date_of_receipt as date, ii.qty as qty, COALESCE(ii.bond_no, ie.bond_no) as reference, 'Initial Bonding' as remarks
                FROM inward_items ii
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE ii.id = ?
                
                UNION ALL
                
                SELECT 'OUTWARD' as txn_type, oe.dispatch_date as date, oi.qty_dispatched as qty, ie.bond_no as reference, oe.nature_of_removal as remarks
                FROM outward_items oi
                JOIN outward_entries oe ON oi.outward_id = oe.id
                JOIN inward_items ii ON oi.inward_item_id = ii.id
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE oi.inward_item_id = ?
                
                UNION ALL
                
                SELECT 'DAMAGED' as txn_type, di.reported_date as date, di.qty_damaged as qty, di.reason as reference, 'Damage deduction' as remarks
                FROM damaged_items di
                JOIN inward_items ii ON di.inward_item_id = ii.id
                WHERE di.inward_item_id = ?
                
                UNION ALL
                
                SELECT 'RETURNED' as txn_type, re.return_date as date, re.qty_returned as qty, ie.bond_no as reference, re.remarks as remarks
                FROM return_stock_entries re
                JOIN inward_entries ie ON re.inward_id = ie.id
                WHERE re.inward_item_id = ?
                
                ORDER BY date ASC
            `;
            params = [itemId, itemId, itemId, itemId];
        } else {
            return res.status(400).json({ error: 'Invalid ledger type' });
        }

        const [entries] = await db.query(query, params);
        res.json(entries);
    } catch (error) {
        console.error("Ledger API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Shipping Bill report
router.get('/shipping-bill', async (req, res) => {
    const db = req.app.locals.db;
    const { shipping_bill_no, outward_ids, consignment_id, date } = req.query;
    
    try {
        let query = `
            SELECT oi.*, oe.dispatch_date, oe.flight_no, oe.shipping_bill_no, oe.shipping_bill_date,
                   COALESCE(ii.bond_no, ie.bond_no) as bond_no, ie.be_no, 
                   c.name as consignment_name, c.code as consignment_code
            FROM outward_items oi
            JOIN outward_entries oe ON oi.outward_id = oe.id
            JOIN inward_items ii ON oi.inward_item_id = ii.id
            JOIN inward_entries ie ON ii.inward_id = ie.id
            LEFT JOIN consignments c ON oe.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        
        if (shipping_bill_no) {
            query += ' AND oe.shipping_bill_no = ?';
            params.push(shipping_bill_no);
        }
        if (outward_ids) {
            const ids = outward_ids.split(',').map(id => parseInt(id.trim()));
            query += ` AND oe.id IN (${ids.map(() => '?').join(',')})`;
            params.push(...ids);
        }
        if (consignment_id) {
            query += ' AND oe.consignment_id = ?';
            params.push(consignment_id);
        }
        if (date) {
            query += ' AND oe.dispatch_date = ?';
            params.push(date);
        }
        
        query += ' ORDER BY oe.id';
        
        const [entries] = await db.query(query, params);
        
        if (entries.length === 0) {
            return res.json({
                report_type: 'SHIPPING_BILL',
                message: 'No entries found',
                entries: []
            });
        }
        
        // Calculate totals
        let totalQty = 0, totalValue = 0, totalDuty = 0;
        const items = entries.map((entry, index) => {
            totalQty += entry.qty_dispatched;
            totalValue += entry.value;
            totalDuty += entry.duty;
            
            return {
                s_no: index + 1,
                bond_no: entry.bond_no,
                description: entry.description,
                cks_ny_pock: '', 
                qty: entry.qty_dispatched,
                value: entry.value.toFixed(2),
                duty: entry.duty.toFixed(2)
            };
        });
        
        const consignment = entries[0];
        
        res.json({
            report_type: 'SHIPPING_BILL',
            report_title: `EX ${consignment.consignment_name || ''} BONDED GOODS`,
            subtitle: 'FOR AIRCRAFT USE',
            header: {
                shipping_bill_no: consignment.shipping_bill_no || shipping_bill_no,
                date: consignment.shipping_bill_date || consignment.dispatch_date,
                flight_no: consignment.flight_no,
                station: 'COCHIN',
                ge_no: consignment.shipping_bill_no
            },
            company: {
                name: 'CASINO AIR CATERERS & FLIGHT SERVICES',
                address: '(Unit of Anjali Hotels) Kerala'
            },
            items,
            totals: {
                qty: totalQty,
                value: totalValue.toFixed(2),
                duty: totalDuty.toFixed(2)
            },
            signatures: [
                { title: 'Customs Air Cargo Officer' },
                { title: 'Preventive Officer, Custom House Cochin' },
                { title: 'Airline Stores Officer' },
                { title: 'Inspector of Customs' }
            ],
            generated_at: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard stats
router.get('/dashboard', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    
    try {
        let whereClause = branch_id ? ' WHERE branch_id = ?' : ' WHERE 1=1';
        let params = branch_id ? [branch_id] : [];

        const [[totalItems]] = await db.query('SELECT COUNT(*) as count FROM items');
        const [[totalConsignments]] = await db.query('SELECT COUNT(*) as count FROM consignments');
        
        const [[inwardStats]] = await db.query(`
            SELECT COUNT(DISTINCT ii.inward_id) as count, SUM(ii.qty) as total_qty 
            FROM inward_items ii
            WHERE ii.inward_id IN (SELECT id FROM inward_entries ${whereClause})
        `, params);
        
        const [[outwardStats]] = await db.query(`
            SELECT COUNT(DISTINCT oi.outward_id) as count, 
                   SUM(oi.qty_dispatched) as dispatched,
                   SUM(oi.qty_returned_bag) as returned_bag
            FROM outward_items oi
            WHERE oi.outward_id IN (SELECT id FROM outward_entries ${whereClause})
        `, params);

        const [[damagedResult]] = await db.query(`
            SELECT COALESCE(SUM(di.qty_damaged), 0) as total FROM damaged_items di
            WHERE ${branch_id ? "di.branch_id = ?" : "1=1"}
        `, branch_id ? [branch_id] : []);
        
        const [[returnResult]] = await db.query(`
            SELECT COALESCE(SUM(rs.qty_returned), 0) as total FROM return_stock_entries rs
            WHERE ${branch_id ? "rs.branch_id = ?" : "1=1"}
        `, branch_id ? [branch_id] : []);
        
        const totalInwardQty = inwardStats.total_qty || 0;
        const totalOutwardQty = outwardStats.dispatched || 0;
        const totalReturnedBag = outwardStats.returned_bag || 0;
        const totalDamaged = damagedResult.total || 0;
        const totalReturnedOrigin = returnResult.total || 0;
        
        const current_stock = Number(totalInwardQty) - (Number(totalOutwardQty) - Number(totalReturnedBag)) - Number(totalDamaged) + Number(totalReturnedOrigin);
        
        const currentDate = new Date();
        const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1).toISOString().split('T')[0];
        
        const [[expiringCount]] = await db.query(`
            SELECT COUNT(*) as count FROM inward_entries 
            WHERE (initial_bonding_expiry < ? OR (extended_bonding_expiry1 IS NOT NULL AND extended_bonding_expiry1 < ?))
            ${branch_id ? " AND branch_id = ?" : ""}
        `, [nextMonth, nextMonth, ...(branch_id ? [branch_id] : [])]);
        
        const [recentInward] = await db.query(`
            SELECT ie.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(ii.description) FROM inward_items ii WHERE ii.inward_id = ie.id) as items_list,
                   (SELECT SUM(qty) FROM inward_items ii WHERE ii.inward_id = ie.id) as qty_received
            FROM inward_entries ie 
            LEFT JOIN consignments c ON ie.consignment_id = c.id 
            ${branch_id ? " WHERE ie.branch_id = ?" : ""}
            ORDER BY ie.created_at DESC LIMIT 5
        `, branch_id ? [branch_id] : []);
        
        const [recentOutward] = await db.query(`
            SELECT oe.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(ii.description) FROM outward_items oi 
                    JOIN inward_items ii ON oi.inward_item_id = ii.id 
                    WHERE oi.outward_id = oe.id) as items_list,
                   (SELECT SUM(qty_dispatched) FROM outward_items oi WHERE oi.outward_id = oe.id) as total_dispatched,
                   (SELECT SUM(qty_returned_bag) FROM outward_items oi WHERE oi.outward_id = oe.id) as total_returned
            FROM outward_entries oe 
            LEFT JOIN consignments c ON oe.consignment_id = c.id 
            ${branch_id ? " WHERE oe.branch_id = ?" : ""}
            ORDER BY oe.created_at DESC LIMIT 5
        `, branch_id ? [branch_id] : []);
        
        res.json({
            stats: {
                total_items: totalItems.count,
                total_consignments: totalConsignments.count,
                total_inward_entries: inwardStats.count || 0,
                total_qty_received: totalInwardQty,
                total_outward_entries: outwardStats.count || 0,
                total_qty_dispatched: totalOutwardQty,
                total_qty_returned_origin: totalReturnedOrigin,
                current_stock: current_stock,
                expiring_soon: expiringCount.count
            },
            recent_inward: recentInward,
            recent_outward: recentOutward
        });
    } catch (error) {
        console.error('Dashboard API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get External Transfer (Annexure) entries
router.get('/external-transfers', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT oe.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(oi.description) FROM outward_items oi WHERE oi.outward_id = oe.id) as items_list,
                   (SELECT COUNT(*) FROM outward_items oi WHERE oi.outward_id = oe.id) as item_count,
                   (SELECT bond_no FROM inward_entries ie WHERE ie.id = oe.inward_id) as inward_bond_no,
                   (SELECT be_no FROM inward_entries ie WHERE ie.id = oe.inward_id) as inward_be_no,
                   (SELECT be_date FROM inward_entries ie WHERE ie.id = oe.inward_id) as inward_be_date
            FROM outward_entries oe
            LEFT JOIN consignments c ON oe.consignment_id = c.id
            WHERE oe.nature_of_removal = 'Transfer'
        `;
        let params = [];
        if (branch_id) {
            query += ' AND oe.branch_id = ?';
            params.push(branch_id);
        }
        query += ' ORDER BY oe.dispatch_date DESC';
        const [entries] = await db.query(query, params);
        res.json(entries);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Reorder Levels Report (Airline-wise)
router.get('/reorder-levels', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT i.id, i.description, i.category, i.min_stock, c.name as airline_name,
                (
                    COALESCE((SELECT SUM(ii.qty) FROM inward_items ii 
                             JOIN inward_entries ie ON ii.inward_id = ie.id 
                             WHERE ii.item_id = i.id AND ie.consignment_id = c.id 
                             ${branch_id ? 'AND ie.branch_id = ?' : ''}), 0) -
                    COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi 
                             JOIN outward_entries oe ON oi.outward_id = oe.id 
                             WHERE oi.item_id = i.id AND oe.consignment_id = c.id 
                             ${branch_id ? 'AND oe.branch_id = ?' : ''}), 0) -
                    COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di 
                             JOIN inward_items iid ON di.inward_item_id = iid.id 
                             JOIN inward_entries ie_dam ON iid.inward_id = ie_dam.id
                             WHERE iid.item_id = i.id AND ie_dam.consignment_id = c.id 
                             ${branch_id ? 'AND di.branch_id = ?' : ''}), 0) +
                    COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse 
                             JOIN inward_items iid_ret ON rse.inward_item_id = iid_ret.id 
                             JOIN inward_entries ie_ret ON iid_ret.inward_id = ie_ret.id
                             WHERE iid_ret.item_id = i.id AND ie_ret.consignment_id = c.id 
                             ${branch_id ? 'AND rse.branch_id = ?' : ''}), 0)
                ) as available_stock
            FROM items i
            CROSS JOIN consignments c
            WHERE i.status = 'ACTIVE' AND i.min_stock > 0 AND c.status = 'ACTIVE'
            HAVING available_stock <= i.min_stock AND available_stock >= 0
            ORDER BY c.name ASC, i.description ASC
        `;
        let params = [];
        if (branch_id) {
            const bId = parseInt(branch_id);
            params.push(bId, bId, bId, bId);
        }
        const [results] = await db.query(query, params);
        res.json(results);
    } catch (error) {
        console.error('Airline-wise Reorder Query Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Detailed Stock (Bond + Item-wise)
router.get('/detailed-stock', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT 
                ii.id as inward_item_id,
                COALESCE(ii.bond_no, ie.bond_no) as bond_no,
                ii.description as item_name,
                c.name as consignment_name,
                ii.qty as total_qty,
                COALESCE((SELECT SUM(oi.qty_dispatched) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) as total_dispatched,
                COALESCE((SELECT SUM(oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) as total_returned,
                (
                    ii.qty - 
                    COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) -
                    COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) +
                    COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)
                ) as available_stock,
                ie.initial_bonding_expiry,
                ie.extended_bonding_expiry1,
                ie.extended_bonding_expiry2,
                ie.extended_bonding_expiry3
            FROM inward_items ii
            JOIN inward_entries ie ON ii.inward_id = ie.id
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        if (branch_id) {
            query += ' AND ie.branch_id = ?';
            params.push(parseInt(branch_id));
        }
        query += ' HAVING available_stock > 0 ORDER BY bond_no ASC, item_name ASC';
        
        const [items] = await db.query(query, params);
        res.json(items);
    } catch (error) {
        console.error('Detailed Stock Query Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Total Item-wise Stock (Aggregated)
router.get('/total-stock', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT i.id, i.description, i.category, i.min_stock, i.unit,
                (
                    COALESCE((SELECT SUM(ii.qty) FROM inward_items ii JOIN inward_entries ie ON ii.inward_id = ie.id WHERE ii.item_id = i.id ${branch_id ? 'AND ie.branch_id = ?' : ''}), 0) -
                    COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi JOIN outward_entries oe ON oi.outward_id = oe.id WHERE oi.item_id = i.id ${branch_id ? 'AND oe.branch_id = ?' : ''}), 0) -
                    COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di JOIN inward_items iid ON di.inward_item_id = iid.id WHERE iid.item_id = i.id ${branch_id ? 'AND di.branch_id = ?' : ''}), 0) +
                    COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse JOIN inward_items iid ON rse.inward_item_id = iid.id WHERE iid.item_id = i.id ${branch_id ? 'AND rse.branch_id = ?' : ''}), 0)
                ) as available_stock
            FROM items i
            WHERE i.status = 'ACTIVE'
            HAVING available_stock > 0
            ORDER BY i.description ASC
        `;
        let params = [];
        if (branch_id) {
            const bId = parseInt(branch_id);
            params.push(bId, bId, bId, bId);
        }
        const [items] = await db.query(query, params);
        res.json(items);
    } catch (error) {
        console.error('Total Stock Query Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
