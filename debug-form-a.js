const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'database', 'cafs.db'));

const query = `
            SELECT ii.id as inward_item_id, ii.description, ii.qty as qty_received, ii.value, ii.duty, ii.unit, ie.pkg_marks,
                   ie.pkg_description, ie.transport_reg_no, ie.otl_no, ie.qty_advised, ie.breakage_shortage,
                   ie.bank_guarantee, ie.relinquishment, ie.value_rate, ie.duty_rate,
                   ie.be_no, ie.be_date, ie.bond_no, ie.bond_date, ie.shipping_bill_no as in_sb_no, ie.shipping_bill_date as in_sb_date,
                   ie.date_of_order_section_60, ie.date_of_receipt, ie.warehouse_code, ie.warehouse_address, ie.customs_station,
                   ie.initial_bonding_expiry, ie.extended_bonding_expiry1,
                   c.name as consignment_name,
                   (SELECT '[' || GROUP_CONCAT(
                       json_object(
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
                   ) || ']' 
                   FROM outward_items oi
                   JOIN outward_entries oe ON oi.outward_id = oe.id
                   WHERE oi.inward_item_id = ii.id) as outward_json
            FROM inward_items ii
            JOIN inward_entries ie ON ii.inward_id = ie.id
            LEFT JOIN consignments c ON ie.consignment_id = c.id
            WHERE 1=1 AND ii.item_id = ?
            ORDER BY ie.date_of_receipt, ie.id
`;

const params = ["1"];
console.log('Running query with params:', params);
try {
    const entries = db.prepare(query).all(...params);
    console.log(`Found ${entries.length} entries.`);
    if (entries.length > 0) {
        console.log('First entry item_id:', entries[0].inward_item_id);
    }
} catch (err) {
    console.error('Error:', err);
}
