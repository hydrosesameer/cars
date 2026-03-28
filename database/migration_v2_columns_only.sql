-- Migration Script: Apply schema updates to existing database
-- Use these to update Railway SQL without losing existing data.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Create Countries table if not exists
CREATE TABLE IF NOT EXISTS `countries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(10) NOT NULL,
  `port_of_discharge` varchar(100) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Update branches table (Godown Master)
-- Add airport_code if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'branches';
SET @columnname = 'airport_code';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME = @tablename
     AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE branches ADD COLUMN airport_code varchar(10) DEFAULT NULL'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Update inward_entries table
-- Add branch_id if it doesn't exist
SET @tablename = 'inward_entries';
SET @columnname = 'branch_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME = @tablename
     AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE inward_entries ADD COLUMN branch_id int(11) DEFAULT NULL, ADD CONSTRAINT fk_inward_branch FOREIGN KEY (branch_id) REFERENCES branches(id)'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Update outward_entries table
SET @tablename = 'outward_entries';
SET @columnname = 'branch_id';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME = @tablename
     AND COLUMN_NAME = @columnname) > 0,
  'SELECT 1',
  'ALTER TABLE outward_entries ADD COLUMN branch_id int(11) DEFAULT NULL, ADD CONSTRAINT fk_outward_branch FOREIGN KEY (branch_id) REFERENCES branches(id)'
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. Update shipping_bills table
-- Add columns for auto-population logic
ALTER TABLE shipping_bills
ADD COLUMN IF NOT EXISTS `flight_no` varchar(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `etd` date DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `vt` varchar(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `port_of_discharge` varchar(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `country_of_destination` varchar(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `station` varchar(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `exporter_name` varchar(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `exporter_address` text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `entered_no` varchar(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `branch_id` int(11) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `unapproved_by` varchar(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `unapproved_at` datetime DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `unapproved_remarks` text DEFAULT NULL;

SET FOREIGN_KEY_CHECKS = 1;
