-- (Append to existing schema.sql later, or just run query)
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
