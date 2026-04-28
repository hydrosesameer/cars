const express = require('express');
const router = express.Router();

// Get all shipping bills
router.get('/', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT sb.*, c.name as consignment_name, c.code as consignment_code,
                   (SELECT COUNT(*) FROM shipping_bill_items sbi WHERE sbi.shipping_bill_id = sb.id) as item_count,
                   (SELECT SUM(sbi.qty) FROM shipping_bill_items sbi WHERE sbi.shipping_bill_id = sb.id) as total_qty,
                   (SELECT SUM(sbi.value_amount) FROM shipping_bill_items sbi WHERE sbi.shipping_bill_id = sb.id) as total_value,
                   (SELECT SUM(sbi.duty_amount) FROM shipping_bill_items sbi WHERE sbi.shipping_bill_id = sb.id) as total_duty
            FROM shipping_bills sb
            LEFT JOIN consignments c ON sb.consignment_id = c.id
            WHERE 1=1
        `;
        let params = [];
        if (branch_id) {
            query += ' AND sb.branch_id = ?';
            params.push(branch_id);
        }
        query += ' ORDER BY sb.created_at DESC, sb.id DESC';
        const [bills] = await db.query(query, params);
        res.json(bills);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single shipping bill with items
router.get('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { branch_id } = req.query;
    try {
        let query = `
            SELECT sb.*, c.name as consignment_name, c.code as consignment_code,
                   b.name as branch_name, b.address as branch_address, b.shipping_place
            FROM shipping_bills sb
            LEFT JOIN consignments c ON sb.consignment_id = c.id
            LEFT JOIN branches b ON sb.branch_id = b.id
            WHERE sb.id = ?
        `;
        let params = [req.params.id];
        if (branch_id) {
            query += ' AND sb.branch_id = ?';
            params.push(branch_id);
        }
        
        const [bills] = await db.query(query, params);
        if (bills.length === 0) return res.status(404).json({ error: 'Shipping bill not found or access denied' });
        const bill = bills[0];

        const [items] = await db.query(`
            SELECT sbi.*, ie.be_no, ie.be_date,
                   COALESCE(ii.bond_date, ie.bond_date) AS bond_date,
                   COALESCE(ii.bond_expiry, ie.extended_bonding_expiry3, ie.extended_bonding_expiry2, ie.extended_bonding_expiry1, ie.initial_bonding_expiry) AS bond_expiry,
                   COALESCE(ii.bond_no, ie.bond_no) AS bond_no
            FROM shipping_bill_items sbi
            LEFT JOIN inward_entries ie ON sbi.inward_id = ie.id
            LEFT JOIN inward_items ii ON sbi.inward_item_id = ii.id
            WHERE sbi.shipping_bill_id = ?
            ORDER BY bond_expiry ASC, sbi.id ASC
        `, [req.params.id]);

        res.json({ ...bill, items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new shipping bill (DRAFT)
router.post('/', async (req, res) => {
    const db = req.app.locals.db;
    const {
        sb_no, sb_date, consignment_id, flight_no,
        etd, vt, port_of_discharge, country_of_destination, station,
        exporter_name, exporter_address, entered_no,
        remarks, items, branch_id
    } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        if (!sb_no || !sb_date) {
            throw new Error('Shipping Bill No and Date are required');
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('At least one item is required');
        }

        // Validate stock availability for each item
        for (const item of items) {
            const [stockRows] = await connection.query(`
                SELECT (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) + COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) as available
                FROM inward_items ii
                WHERE ii.id = ?
            `, [item.inward_item_id]);

            if (stockRows.length === 0) {
                throw new Error(`Item not found: ${item.description}`);
            }
            const stock = stockRows[0];
            if (stock.available < item.qty) {
                throw new Error(`Insufficient stock for ${item.description}. Available: ${stock.available}, Requested: ${item.qty}`);
            }
        }

        let finalBranchId = branch_id;
        if (!finalBranchId && items.length > 0) {
            const [inwardRows] = await connection.query('SELECT branch_id FROM inward_entries WHERE id = ?', [items[0].inward_id]);
            if (inwardRows.length > 0) {
                finalBranchId = inwardRows[0].branch_id;
            }
        }

        const [result] = await connection.query(`
            INSERT INTO shipping_bills (
                sb_no, sb_date, consignment_id, flight_no,
                etd, vt, port_of_discharge, country_of_destination, station,
                exporter_name, exporter_address, entered_no,
                remarks, status, branch_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)
        `, [
            sb_no, sb_date, consignment_id || null, flight_no || null,
            etd || null, vt || null,
            port_of_discharge || null, country_of_destination || null,
            station || null,
            exporter_name || 'CASINO AIR CATERERS & FLIGHT SERVICES',
            exporter_address || '(Unit of Anjali Hotels Pvt.Ltd)',
            entered_no || null,
            remarks || null, finalBranchId
        ]);

        const billId = result.insertId;

        for (const item of items) {
            const qty = parseFloat(item.qty) || 0;
            let uv = parseFloat(item.unit_value || 0);
            let va = parseFloat(item.value_amount || 0);
            if (va > 0 && qty > 0 && uv === 0) uv = va / qty;
            else if (uv > 0 && va === 0) va = uv * qty;

            let ud = parseFloat(item.unit_duty || 0);
            let da = parseFloat(item.duty_amount || 0);
            if (da > 0 && qty > 0 && ud === 0) ud = da / qty;
            else if (ud > 0 && da === 0) da = ud * qty;

            await connection.query(`
                INSERT INTO shipping_bill_items (
                    shipping_bill_id, inward_item_id, inward_id, item_id,
                    description, bond_no, bond_expiry, qty,
                    unit_value, value_amount, unit_duty, duty_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                billId, item.inward_item_id, item.inward_id, item.item_id || null,
                item.description, item.bond_no || null, item.bond_expiry || null, qty,
                uv, va, ud, da
            ]);
        }

        await connection.commit();
        res.json({ id: billId, message: 'Shipping bill created as DRAFT' });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('required') || error.message.includes('Insufficient') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update shipping bill (DRAFT only)
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const {
        sb_no, sb_date, consignment_id, flight_no,
        etd, vt, port_of_discharge, country_of_destination, station,
        exporter_name, exporter_address, entered_no,
        remarks, items
    } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [bills] = await connection.query('SELECT status FROM shipping_bills WHERE id = ?', [req.params.id]);
        if (bills.length === 0) throw new Error('Shipping bill not found');
        if (bills[0].status !== 'DRAFT') throw new Error('Only DRAFT shipping bills can be edited');

        await connection.query(`
            UPDATE shipping_bills SET
                sb_no = ?, sb_date = ?, consignment_id = ?, flight_no = ?,
                etd = ?, vt = ?, port_of_discharge = ?, country_of_destination = ?, station = ?,
                exporter_name = ?, exporter_address = ?, entered_no = ?,
                remarks = ?
            WHERE id = ?
        `, [
            sb_no, sb_date, consignment_id || null, flight_no || null,
            etd || null, vt || null,
            port_of_discharge || null, country_of_destination || null,
            station || null,
            exporter_name || 'CASINO AIR CATERERS & FLIGHT SERVICES',
            exporter_address || '(Unit of Anjali Hotels Pvt.Ltd)',
            entered_no || null,
            remarks || null, req.params.id
        ]);

        if (items && Array.isArray(items) && items.length > 0) {
            await connection.query('DELETE FROM shipping_bill_items WHERE shipping_bill_id = ?', [req.params.id]);
            
            for (const item of items) {
                await connection.query(`
                    INSERT INTO shipping_bill_items (
                        shipping_bill_id, inward_item_id, inward_id, item_id,
                        description, bond_no, bond_expiry, qty,
                        unit_value, value_amount, unit_duty, duty_amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    req.params.id, item.inward_item_id, item.inward_id, item.item_id || null,
                    item.description, item.bond_no || null, item.bond_expiry || null, item.qty,
                    item.unit_value || 0, item.value_amount || 0,
                    item.unit_duty || 0, item.duty_amount || 0
                ]);
            }
        }

        await connection.commit();
        res.json({ message: 'Shipping bill updated' });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('found') || error.message.includes('DRAFT') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Approve shipping bill (auto-creates outward entry and dispatches stock)
router.put('/:id/approve', async (req, res) => {
    const db = req.app.locals.db;
    const { approved_by, user_role, user_branch_id } = req.body;

    // Role-based access control for approval
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'APPROVER'];
    if (!allowedRoles.includes(user_role)) {
        return res.status(403).json({ error: 'You do not have permission to approve shipping bills. Required roles: Manager, Approver, or Admin.' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [bills] = await connection.query(`
            SELECT sb.*, c.name as consignment_name
            FROM shipping_bills sb
            LEFT JOIN consignments c ON sb.consignment_id = c.id
            WHERE sb.id = ?
        `, [req.params.id]);

        if (bills.length === 0) throw new Error('Shipping bill not found');
        const bill = bills[0];

        // Ensure branch match for non-super admins
        if (user_role !== 'SUPER_ADMIN' && bill.branch_id !== user_branch_id) {
            throw new Error('You can only approve shipping bills for your own branch.');
        }

        if (bill.status !== 'DRAFT') throw new Error('Only DRAFT bills can be approved');

        const [sbItems] = await connection.query('SELECT * FROM shipping_bill_items WHERE shipping_bill_id = ?', [req.params.id]);
        if (sbItems.length === 0) throw new Error('No items in this shipping bill');

        // Validate stock before approving & dispatching
        for (const item of sbItems) {
            const [stockRows] = await connection.query(`
                SELECT (ii.qty - COALESCE((SELECT SUM(oi.qty_dispatched - oi.qty_returned_bag) FROM outward_items oi WHERE oi.inward_item_id = ii.id), 0) - COALESCE((SELECT SUM(di.qty_damaged) FROM damaged_items di WHERE di.inward_item_id = ii.id), 0) + COALESCE((SELECT SUM(rse.qty_returned) FROM return_stock_entries rse WHERE rse.inward_item_id = ii.id), 0)) as available
                FROM inward_items ii
                WHERE ii.id = ?
            `, [item.inward_item_id]);

            if (stockRows.length === 0 || stockRows[0].available < item.qty) {
                throw new Error(`Insufficient stock for ${item.description}. Available: ${stockRows.length ? stockRows[0].available : 0}, Required: ${item.qty}`);
            }
        }

        // Create outward entry from shipping bill data
        const totalQty = sbItems.reduce((sum, i) => sum + (parseInt(i.qty) || 0), 0);
        const totalValue = sbItems.reduce((sum, i) => sum + (parseFloat(i.value_amount) || 0), 0);
        const totalDuty = sbItems.reduce((sum, i) => sum + (parseFloat(i.duty_amount) || 0), 0);
        const primaryInwardId = sbItems[0].inward_id;

        const [outwardResult] = await connection.query(`
            INSERT INTO outward_entries (
                inward_id, shipping_bill_id, dispatch_date, flight_no, consignment_id,
                shipping_bill_no, shipping_bill_date,
                registration_no_of_means_of_transport, nature_of_removal, purpose,
                total_dispatched, value, duty, remarks, branch_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Re-export', 'Re-export', ?, ?, ?, ?, ?)
        `, [
            primaryInwardId, bill.id, bill.sb_date, bill.flight_no,
            bill.consignment_id, bill.sb_no, bill.sb_date,
            bill.vt || null,
            totalQty, totalValue, totalDuty,
            `Dispatched from Shipping Bill #${bill.sb_no}`,
            bill.branch_id
        ]);

        const outwardId = outwardResult.insertId;

        for (const item of sbItems) {
            const perUnitValue = item.qty > 0 ? (parseFloat(item.value_amount) || 0) / item.qty : 0;
            const perUnitDuty = item.qty > 0 ? (parseFloat(item.duty_amount) || 0) / item.qty : 0;
            
            await connection.query(`
                INSERT INTO outward_items (outward_id, inward_item_id, inward_id, item_id, description, qty_dispatched, value, duty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                outwardId, item.inward_item_id, item.inward_id, item.item_id,
                item.description, item.qty, perUnitValue, perUnitDuty
            ]);
        }

        // Update shipping bill status to APPROVED
        await connection.query(`
            UPDATE shipping_bills SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [approved_by || 'Manager', req.params.id]);

        await connection.commit();
        res.json({
            message: 'Shipping bill approved & stock dispatched successfully',
            outward_id: outwardId,
            shipping_bill_id: bill.id
        });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('found') || error.message.includes('DRAFT') || error.message.includes('Insufficient') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update shipping bill
router.put('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const { 
        sb_no, sb_date, consignment_id, flight_no, station, etd, vt, remarks, items, 
        user_role, user_branch_id 
    } = req.body;

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [existing] = await connection.query('SELECT status, branch_id FROM shipping_bills WHERE id = ?', [req.params.id]);
        if (existing.length === 0) throw new Error('Shipping bill not found');
        const bill = existing[0];

        if (bill.status !== 'DRAFT') throw new Error('Only DRAFT bills can be edited');

        // Role-based branch check
        if (user_role !== 'SUPER_ADMIN' && bill.branch_id !== user_branch_id) {
            throw new Error('You do not have permission to edit this shipping bill.');
        }

        // 1. Update bill header
        await connection.query(`
            UPDATE shipping_bills SET 
                sb_no = ?, sb_date = ?, consignment_id = ?, flight_no = ?, 
                station = ?, etd = ?, vt = ?, remarks = ?
            WHERE id = ?
        `, [sb_no, sb_date, consignment_id, flight_no, station, etd, vt, remarks, req.params.id]);

        // 2. Handle items
        // Delete items removed in the UI
        const currentItemIds = items.filter(i => i.id).map(i => i.id);
        if (currentItemIds.length > 0) {
            await connection.query('DELETE FROM shipping_bill_items WHERE shipping_bill_id = ? AND id NOT IN (?)', [req.params.id, currentItemIds]);
        } else {
            await connection.query('DELETE FROM shipping_bill_items WHERE shipping_bill_id = ?', [req.params.id]);
        }

        for (const item of items) {
            if (item.id) {
                // Update
                await connection.query(`
                    UPDATE shipping_bill_items SET 
                        inward_item_id = ?, inward_id = ?, item_id = ?, 
                        description = ?, qty = ?, value_amount = ?, duty_amount = ?
                    WHERE id = ?
                `, [item.inward_item_id, item.inward_id, item.item_id, item.description, item.qty, item.value_amount, item.duty_amount, item.id]);
            } else {
                // Insert
                await connection.query(`
                    INSERT INTO shipping_bill_items (
                        shipping_bill_id, inward_item_id, inward_id, item_id, 
                        description, qty, value_amount, duty_amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [req.params.id, item.inward_item_id, item.inward_id, item.item_id, item.description, item.qty, item.value_amount, item.duty_amount]);
            }
        }

        await connection.commit();
        res.json({ message: 'Shipping bill updated successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Delete shipping bill (DRAFT only)
router.delete('/:id', async (req, res) => {
    const db = req.app.locals.db;
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [bills] = await connection.query('SELECT status, created_at FROM shipping_bills WHERE id = ?', [req.params.id]);
        if (bills.length === 0) throw new Error('Shipping bill not found');
        const bill = bills[0];

        if (bill.status !== 'DRAFT') throw new Error('Only DRAFT bills can be deleted');

        // Enforcement: Only Admin/Manager within 3 days
        const user_role = req.body.user_role || req.query.user_role;
        const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
        if (!allowedRoles.includes(user_role)) {
            throw new Error('You do not have permission to delete shipping bills. (Role: ' + (user_role || 'none') + ')');
        }

        const createdDate = new Date(bill.created_at);
        const now = new Date();
        const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 3) {
            throw new Error('Deletion is only allowed within 3 days of creation.');
        }

        await connection.query('DELETE FROM shipping_bill_items WHERE shipping_bill_id = ?', [req.params.id]);
        await connection.query('DELETE FROM shipping_bills WHERE id = ?', [req.params.id]);
        
        await connection.commit();
        res.json({ message: 'Shipping bill deleted' });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('found') || error.message.includes('DRAFT') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Unapprove shipping bill (deletes outward entry and reverts to DRAFT)
router.post('/:id/unapprove', async (req, res) => {
    const db = req.app.locals.db;
    const { unapproved_by, remarks, user_role, user_branch_id } = req.body;

    // Role-based access control for unapproval
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
    if (!allowedRoles.includes(user_role)) {
        return res.status(403).json({ error: 'You do not have permission to unapprove shipping bills.' });
    }

    if (!remarks || remarks.trim() === '') {
        return res.status(400).json({ error: 'Remarks are mandatory for unapproval.' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const [bills] = await connection.query('SELECT * FROM shipping_bills WHERE id = ?', [req.params.id]);
        if (bills.length === 0) throw new Error('Shipping bill not found');
        const bill = bills[0];

        if (bill.status !== 'APPROVED') throw new Error('Only APPROVED bills can be unapproved');

        // Ensure branch match for non-super admins (Relaxed for ADMIN)
        const globalRoles = ['SUPER_ADMIN', 'ADMIN'];
        if (!globalRoles.includes(user_role) && bill.branch_id !== user_branch_id) {
            throw new Error('You can only unapprove shipping bills for your own branch.');
        }

        // 1. Find and delete associated outward items and entries
        const [outwards] = await connection.query('SELECT id FROM outward_entries WHERE shipping_bill_id = ?', [req.params.id]);
        for (const out of outwards) {
            await connection.query('DELETE FROM outward_items WHERE outward_id = ?', [out.id]);
            await connection.query('DELETE FROM outward_entries WHERE id = ?', [out.id]);
        }

        // 2. Revert shipping bill to DRAFT
        await connection.query(`
            UPDATE shipping_bills SET 
                status = 'DRAFT', 
                unapproved_by = ?, 
                unapproved_at = CURRENT_TIMESTAMP,
                unapproved_remarks = ?
            WHERE id = ?
        `, [unapproved_by || 'Admin', remarks, req.params.id]);

        await connection.commit();
        res.json({ message: 'Shipping bill unapproved successfully. It is now in DRAFT status.' });
    } catch (error) {
        await connection.rollback();
        res.status(error.message.includes('found') || error.message.includes('APPROVED') ? 400 : 500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Reject shipping bill (sets remarks for DRAFT bills)
router.post('/:id/reject', async (req, res) => {
    const db = req.app.locals.db;
    const { rejected_by, remarks, user_role, user_branch_id } = req.body;

    // Role-based access control for rejection
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
    if (!allowedRoles.includes(user_role)) {
        return res.status(403).json({ error: 'You do not have permission to reject shipping bills.' });
    }

    if (!remarks || remarks.trim() === '') {
        return res.status(400).json({ error: 'Remarks are mandatory for rejection.' });
    }

    try {
        const [bills] = await db.query('SELECT * FROM shipping_bills WHERE id = ?', [req.params.id]);
        if (bills.length === 0) return res.status(404).json({ error: 'Shipping bill not found' });
        const bill = bills[0];

        if (bill.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT bills can be rejected with remarks.' });

        const globalRoles = ['SUPER_ADMIN', 'ADMIN'];
        if (!globalRoles.includes(user_role) && bill.branch_id !== user_branch_id) {
            return res.status(403).json({ error: 'You can only reject shipping bills for your own branch.' });
        }

        await db.query(`
            UPDATE shipping_bills SET 
                unapproved_by = ?, 
                unapproved_at = CURRENT_TIMESTAMP,
                unapproved_remarks = ?
            WHERE id = ?
        `, [rejected_by || 'Admin', remarks, req.params.id]);

        res.json({ message: 'Shipping bill marked as Not Approved with remarks.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
