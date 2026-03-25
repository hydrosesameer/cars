-- FINAL COMPREHENSIVE MySQL Schema for CAFS Inventory

SET FOREIGN_KEY_CHECKS = 0;


CREATE TABLE IF NOT EXISTS branches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    address TEXT,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role ENUM('SUPER_ADMIN', 'ADMIN', 'STAFF') NOT NULL DEFAULT 'STAFF',
    branch_id INT,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS consignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    airline_code VARCHAR(10),
    type ENUM('AIRLINE', 'LOCATION', 'SHIP', 'ROAD', 'OTHER') DEFAULT 'OTHER',
    address TEXT,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    unit VARCHAR(20) DEFAULT 'PCS',
    hsn_code VARCHAR(50),
    category VARCHAR(100),
    min_stock INT DEFAULT 0,
    current_stock INT DEFAULT 0,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inward_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    be_no VARCHAR(50),
    be_date DATE,
    bond_no VARCHAR(50),
    bond_date DATE,
    shipping_bill_no VARCHAR(50),
    shipping_bill_date DATE,
    flight_no VARCHAR(50),
    awb_no VARCHAR(50),
    bill_no VARCHAR(50),
    received_by VARCHAR(100),
    otl_no VARCHAR(50),
    mode_of_receipt VARCHAR(50) DEFAULT 'By Road',
    qty_advised INT,
    qty_received INT NOT NULL DEFAULT 0,
    breakage_shortage INT DEFAULT 0,
    date_of_receipt DATE NOT NULL,
    consignment_id INT,
    item_id INT,
    initial_bonding_date DATE,
    initial_bonding_expiry DATE,
    extended_bonding_date1 DATE,
    extended_bonding_expiry1 DATE,
    extended_bonding_date2 DATE,
    extended_bonding_expiry2 DATE,
    extended_bonding_date3 DATE,
    extended_bonding_expiry3 DATE,
    bank_guarantee TEXT,
    relinquishment TINYINT(1) DEFAULT 0,
    duty_rate DECIMAL(15,4),
    value_rate DECIMAL(15,4),
    value DECIMAL(15,2),
    duty DECIMAL(15,2),
    sl_no_import_invoice VARCHAR(50),
    pkg_marks TEXT,
    pkg_description TEXT,
    transport_reg_no VARCHAR(50),
    date_of_order_section_60 DATE,
    warehouse_code VARCHAR(50),
    warehouse_address TEXT,
    customs_station VARCHAR(100),
    remarks TEXT,
    branch_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (consignment_id) REFERENCES consignments(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS inward_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inward_id INT NOT NULL,
    item_id INT,
    description VARCHAR(255),
    qty INT NOT NULL,
    unit VARCHAR(20),
    value DECIMAL(15,2),
    duty DECIMAL(15,2),
    qty_out INT DEFAULT 0,
    bond_no VARCHAR(50),
    bond_expiry DATE,
    unit_value DECIMAL(15,4),
    value_amount DECIMAL(15,2),
    unit_duty DECIMAL(15,4),
    duty_amount DECIMAL(15,2),
    hsn_code VARCHAR(50),
    shelf_life_date DATE,
    FOREIGN KEY (inward_id) REFERENCES inward_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS outward_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dispatch_date DATE NOT NULL,
    consignment_id INT,
    inward_id INT,
    nature_of_removal VARCHAR(100),
    shipping_bill_no VARCHAR(50),
    shipping_bill_date DATE,
    flight_no VARCHAR(50),
    purpose VARCHAR(100),
    gate_pass_no VARCHAR(50),
    released_by VARCHAR(100),
    total_dispatched INT DEFAULT 0,
    total_returned INT DEFAULT 0,
    value DECIMAL(15,2),
    duty DECIMAL(15,2),
    registration_no_of_means_of_transport VARCHAR(50),
    otl_no VARCHAR(50),
    remarks TEXT,
    branch_id INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (consignment_id) REFERENCES consignments(id),
    FOREIGN KEY (inward_id) REFERENCES inward_entries(id)
);

CREATE TABLE IF NOT EXISTS outward_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    outward_id INT NOT NULL,
    inward_item_id INT NOT NULL,
    inward_id INT,
    item_id INT,
    description VARCHAR(255),
    qty_dispatched INT NOT NULL,
    qty_returned_bag INT DEFAULT 0,
    value DECIMAL(15,2),
    duty DECIMAL(15,2),
    FOREIGN KEY (outward_id) REFERENCES outward_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (inward_item_id) REFERENCES inward_items(id),
    FOREIGN KEY (inward_id) REFERENCES inward_entries(id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS damaged_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reported_date DATE NOT NULL,
    inward_item_id INT NOT NULL,
    qty_damaged INT NOT NULL,
    reason TEXT,
    reported_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inward_item_id) REFERENCES inward_items(id)
);

CREATE TABLE IF NOT EXISTS shipping_bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sb_no VARCHAR(50) NOT NULL UNIQUE,
    consignment_id INT,
    entered_date DATE,
    status VARCHAR(20) DEFAULT 'DRAFT',
    approved_by VARCHAR(100),
    approved_at DATETIME,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (consignment_id) REFERENCES consignments(id)
);

CREATE TABLE IF NOT EXISTS shipping_bill_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shipping_bill_id INT NOT NULL,
    inward_item_id INT NOT NULL,
    inward_id INT NOT NULL,
    item_id INT,
    description VARCHAR(255),
    bond_no VARCHAR(50),
    bond_expiry DATE,
    qty INT NOT NULL,
    unit_value DECIMAL(15,4),
    value_amount DECIMAL(15,2),
    unit_duty DECIMAL(15,4),
    duty_amount DECIMAL(15,2),
    FOREIGN KEY (shipping_bill_id) REFERENCES shipping_bills(id) ON DELETE CASCADE,
    FOREIGN KEY (inward_item_id) REFERENCES inward_items(id),
    FOREIGN KEY (inward_id) REFERENCES inward_entries(id)
);

CREATE TABLE IF NOT EXISTS return_stock_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_date DATE NOT NULL,
    inward_id INT,
    inward_item_id INT,
    qty_returned INT NOT NULL,
    remarks VARCHAR(255),
    authorised_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inward_id) REFERENCES inward_entries(id) ON DELETE SET NULL,
    FOREIGN KEY (inward_item_id) REFERENCES inward_items(id) ON DELETE SET NULL
);

SET FOREIGN_KEY_CHECKS = 1;
