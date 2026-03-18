const express = require('express');
const router = express.Router();

// Form-A: Item-wise ledger report
router.get('/form-a', async (req, res) => {
    const db = req.app.locals.db;
    const { item_id, bond_no, from_date, to_date } = req.query;
    
    try {
        let query = `
            SELECT ii.id as inward_item_id, ii.description, ii.qty as qty_received, ii.value, ii.duty, ii.unit, ie.pkg_marks,
                   ie.pkg_description, ie.transport_reg_no, ie.otl_no, ie.qty_advised, ie.breakage_shortage,
                   ie.bank_guarantee, ie.relinquishment, ie.value_rate, ie.duty_rate,
                   ie.be_no, ie.be_date, ie.bond_no, ie.bond_date, ie.shipping_bill_no as in_sb_no, ie.shipping_bill_date as in_sb_date,
                   ie.date_of_order_section_60, ie.date_of_receipt, ie.warehouse_code, ie.warehouse_address, ie.customs_station,
                   ie.initial_bonding_expiry, ie.extended_bonding_expiry1,
                   c.name as consignment_name,
                   (SELECT CONCAT('[', IFNULL(GROUP_CONCAT(
                       JSON_OBJECT(
                           'id', oe.id,
                           'dispatch_date', oe.dispatch_date,
                           'qty_dispatched', oi.qty_dispatched,
                           'qty_returned_bag', oi.qty_returned_bag,
                           'shipping_bill_no', oe.shipping_bill_no,
                           'shipping_bill_date', oe.shipping_bill_date,
                           'purpose', oe.purpose,
                           'value', oi.value,
                           'duty', oi.duty
                       )
                   ), ''), ']') 
                   FROM outward_items oi
                   JOIN outward_entries oe ON oi.outward_id = oe.id
                   WHERE oi.inward_item_id = ii.id) as outward_json
            FROM inward_items ii
            JOIN inward_entries ie ON ii.inward_id = ie.id
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        
        if (item_id) {
            // Fetch description to match against inward_items that have null item_id but matching description
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
            query += ' AND ie.bond_no LIKE ?';
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
        
        query += ' ORDER BY ie.date_of_receipt, ie.id';
        
        const [entries] = await db.query(query, params);
        
        // Parse outward JSON and calculate running balance
        let runningBalance = 0;
        const result = entries.map(entry => {
            let outwardEntries = [];
            if (entry.outward_json && entry.outward_json !== '[]') {
                try { 
                    outwardEntries = JSON.parse(entry.outward_json); 
                } catch (e) { 
                    console.error('JSON parse error for outward_json', e);
                    outwardEntries = [];
                }
            }
            
            const totalDispatched = outwardEntries.reduce((sum, o) => sum + (o.qty_dispatched || 0), 0);
            const totalReturned = outwardEntries.reduce((sum, o) => sum + (o.qty_returned_bag || 0), 0);
            runningBalance += entry.qty_received - totalDispatched + totalReturned;
            
            return {
                ...entry,
                outward_entries: outwardEntries,
                total_dispatched: totalDispatched,
                total_returned: totalReturned,
                balance: runningBalance
            };
        });
        
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
    const { month, year } = req.query;
    
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    
    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    
    try {
        let query = `
            SELECT ie.*, c.name as consignment_name,
                (ie.qty_received - COALESCE(
                    (SELECT SUM(qty_dispatched - qty_returned_bag) FROM outward_items WHERE inward_id = ie.id), 0
                ) - COALESCE(
                    (SELECT SUM(di.qty_damaged) FROM damaged_items di JOIN inward_items ii ON di.inward_item_id = ii.id WHERE ii.inward_id = ie.id), 0
                ) + COALESCE(
                    (SELECT SUM(rse.qty_returned) FROM return_stock_entries rse JOIN inward_items ii ON rse.inward_item_id = ii.id WHERE ii.inward_id = ie.id), 0
                )) as qty_in_stock
            FROM inward_entries ie
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE (
                (ie.initial_bonding_expiry >= ? AND ie.initial_bonding_expiry < ?)
                OR (ie.extended_bonding_expiry1 >= ? AND ie.extended_bonding_expiry1 < ?)
                OR (ie.extended_bonding_expiry2 >= ? AND ie.extended_bonding_expiry2 < ?)
            )
            AND (ie.qty_received - COALESCE(
                (SELECT SUM(qty_dispatched - qty_returned_bag) FROM outward_items WHERE inward_id = ie.id), 0
            ) - COALESCE(
                (SELECT SUM(di.qty_damaged) FROM damaged_items di JOIN inward_items ii ON di.inward_item_id = ii.id WHERE ii.inward_id = ie.id), 0
            ) + COALESCE(
                (SELECT SUM(rse.qty_returned) FROM return_stock_entries rse JOIN inward_items ii ON rse.inward_item_id = ii.id WHERE ii.inward_id = ie.id), 0
            )) > 0
        `;
        
        let params = [startDate, endDate, startDate, endDate, startDate, endDate];
        
        if (req.query.consignment_id) {
            query += ` AND ie.consignment_id = ?`;
            params.push(req.query.consignment_id);
        }
        
        query += ` ORDER BY c.name, ie.initial_bonding_expiry`;

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
            report_title: `FORM-B FOR THE MONTH OF ${monthNames[targetMonth]} ${targetYear}`,
            subtitle: 'Details of goods stored in the warehouse where the period for which they may remain warehoused under section 61 is expiring in the following month.',
            circular_ref: 'Circular No 25/2016 -Customs dated 08.06.2016',
            warehouse_code: 'Cok15003',
            warehouse_name: 'M/s. Casino Air Caterers & Flight Services (Unit Of Anjali Hotels) Nayathode P.O Angamali Kerala 683572',
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
    try {
        const [rows] = await db.query('SELECT DISTINCT bond_no FROM inward_entries WHERE bond_no IS NOT NULL AND bond_no != "" ORDER BY bond_no ASC');
        res.json(rows.map(r => r.bond_no));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Detailed Stock Report
router.get('/stock-report', async (req, res) => {
    const db = req.app.locals.db;
    const { consignment_id, item_id, bond_no, from_date, to_date, expiry_date } = req.query;
    try {
        let query = `
            SELECT * FROM (
                SELECT ii.*, ie.be_no, ie.be_date, ie.bond_no, ie.initial_bonding_expiry, ie.date_of_receipt,
                       ie.extended_bonding_expiry1, ie.extended_bonding_expiry2, ie.extended_bonding_expiry3,
                       ie.consignment_id,
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
                WHERE ie.bond_no = ?
                
                UNION ALL
                
                SELECT 'OUTWARD' as txn_type, oe.dispatch_date as date, oi.qty_dispatched as qty, oe.nature_of_removal as reference, oe.shipping_bill_no as remarks
                FROM outward_items oi
                JOIN outward_entries oe ON oi.outward_id = oe.id
                JOIN inward_items ii ON oi.inward_item_id = ii.id
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE ie.bond_no = ?
                
                UNION ALL
                
                SELECT 'DAMAGED' as txn_type, di.reported_date as date, di.qty_damaged as qty, di.reason as reference, 'Damage deduction' as remarks
                FROM damaged_items di
                JOIN inward_items ii ON di.inward_item_id = ii.id
                JOIN inward_entries ie ON ii.inward_id = ie.id
                WHERE ie.bond_no = ?
                
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
                SELECT 'INWARD' as txn_type, ie.date_of_receipt as date, ii.qty as qty, ie.bond_no as reference, 'Initial Bonding' as remarks
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
                   ie.bond_no, ie.be_no, 
                   c.name as consignment_name, c.code as consignment_code
            FROM outward_items oi
            JOIN outward_entries oe ON oi.outward_id = oe.id
            JOIN inward_entries ie ON oi.inward_id = ie.id
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
    
    try {
        const [[totalItems]] = await db.query('SELECT COUNT(*) as count FROM items');
        const [[totalConsignments]] = await db.query('SELECT COUNT(*) as count FROM consignments');
        
        const [[inwardStats]] = await db.query(`
            SELECT COUNT(DISTINCT inward_id) as count, SUM(qty) as total_qty 
            FROM inward_items
        `);
        
        const [[outwardStats]] = await db.query(`
            SELECT COUNT(DISTINCT outward_id) as count, SUM(qty_dispatched) as dispatched 
            FROM outward_items
        `);

        const [[damagedResult]] = await db.query('SELECT COALESCE(SUM(qty_damaged), 0) as total FROM damaged_items');
        const [[returnResult]] = await db.query('SELECT COALESCE(SUM(qty_returned), 0) as total FROM return_stock_entries');
        
        const totalInwardQty = inwardStats.total_qty || 0;
        const totalOutwardQty = outwardStats.dispatched || 0;
        const totalDamaged = damagedResult.total || 0;
        const totalReturnedOrigin = returnResult.total || 0;
        
        // Items expiring this month
        const currentDate = new Date();
        const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        const [[expiringCount]] = await db.query(`
            SELECT COUNT(*) as count FROM inward_entries 
            WHERE initial_bonding_expiry < ? 
               OR (extended_bonding_expiry1 IS NOT NULL AND extended_bonding_expiry1 < ?)
        `, [nextMonth.toISOString().split('T')[0], nextMonth.toISOString().split('T')[0]]);
        
        const [recentInward] = await db.query(`
            SELECT ie.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(ii.description) FROM inward_items ii WHERE ii.inward_id = ie.id) as items_list,
                   (SELECT SUM(qty) FROM inward_items ii WHERE ii.inward_id = ie.id) as qty_received
            FROM inward_entries ie 
            LEFT JOIN consignments c ON ie.consignment_id = c.id 
            ORDER BY ie.created_at DESC LIMIT 5
        `);
        
        const [recentOutward] = await db.query(`
            SELECT oe.*, c.name as consignment_name,
                   (SELECT GROUP_CONCAT(ii.description) FROM outward_items oi 
                    JOIN inward_items ii ON oi.inward_item_id = ii.id 
                    WHERE oi.outward_id = oe.id) as items_list,
                   (SELECT SUM(qty_dispatched) FROM outward_items oi WHERE oi.outward_id = oe.id) as total_dispatched,
                   (SELECT SUM(qty_returned_bag) FROM outward_items oi WHERE oi.outward_id = oe.id) as total_returned
            FROM outward_entries oe 
            LEFT JOIN consignments c ON oe.consignment_id = c.id 
            ORDER BY oe.created_at DESC LIMIT 5
        `);
        
        res.json({
            stats: {
                total_items: totalItems.count,
                total_consignments: totalConsignments.count,
                total_inward_entries: inwardStats.count || 0,
                total_qty_received: totalInwardQty,
                total_outward_entries: outwardStats.count || 0,
                total_qty_dispatched: totalOutwardQty,
                total_qty_returned: 0, // Simplified for now as it's complex to aggregate bag returns here
                total_qty_returned_origin: totalReturnedOrigin,
                current_stock: totalInwardQty - totalOutwardQty - totalDamaged + totalReturnedOrigin,
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

module.exports = router;
