-- Migration Script: Apply schema updates to existing database (V2 - Safe even for old MySQL versions)
-- Use these to update Railway SQL without losing existing data.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create Countries table if not exists (Standard syntax)
CREATE TABLE IF NOT EXISTS `countries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(10) NOT NULL,
  `port_of_discharge` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Update branches table (Godown Master)
-- Add airport_code if it doesn't exist (Using IF inside Procedure for widest compatibility)
DROP PROCEDURE IF EXISTS AddColumnSafely;
DELIMITER //
CREATE PROCEDURE AddColumnSafely(
    IN p_table_name VARCHAR(64),
    IN p_column_name VARCHAR(64),
    IN p_column_def VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = p_table_name
        AND COLUMN_NAME = p_column_name
    ) THEN
        SET @s = CONCAT('ALTER TABLE ', p_table_name, ' ADD COLUMN ', p_column_name, ' ', p_column_def);
        PREPARE stmt FROM @s;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- Apply to branches
CALL AddColumnSafely('branches', 'airport_code', 'varchar(10) DEFAULT NULL');

-- Apply to inward_entries
CALL AddColumnSafely('inward_entries', 'branch_id', 'int(11) DEFAULT NULL');
-- (Note: Foreign key constraints should be added separately if needed, but columns are first priority)

-- Apply to outward_entries
CALL AddColumnSafely('outward_entries', 'branch_id', 'int(11) DEFAULT NULL');

-- Apply to shipping_bills
CALL AddColumnSafely('shipping_bills', 'flight_no', 'varchar(50) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'etd', 'date DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'vt', 'varchar(50) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'port_of_discharge', 'varchar(100) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'country_of_destination', 'varchar(100) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'station', 'varchar(100) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'exporter_name', 'varchar(255) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'exporter_address', 'text DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'entered_no', 'varchar(50) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'branch_id', 'int(11) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'unapproved_by', 'varchar(100) DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'unapproved_at', 'datetime DEFAULT NULL');
CALL AddColumnSafely('shipping_bills', 'unapproved_remarks', 'text DEFAULT NULL');

-- Clean up procedure
DROP PROCEDURE IF EXISTS AddColumnSafely;

SET FOREIGN_KEY_CHECKS = 1;
