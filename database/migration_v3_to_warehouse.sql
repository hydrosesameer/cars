-- Migration Script V3: Add missing columns for External Transfer
-- Database: cafs

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

-- Add to_warehouse to outward_entries
CALL AddColumnSafely('outward_entries', 'to_warehouse', 'TEXT DEFAULT NULL');

-- Add nature_of_removal if missing (sometimes it's there but let's be safe)
CALL AddColumnSafely('outward_entries', 'nature_of_removal', 'VARCHAR(100) DEFAULT NULL');

-- Ensure registration_no_of_means_of_transport exists (matches frontend transport_reg_no)
CALL AddColumnSafely('outward_entries', 'registration_no_of_means_of_transport', 'VARCHAR(100) DEFAULT NULL');

DROP PROCEDURE IF EXISTS AddColumnSafely;
