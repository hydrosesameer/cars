SET FOREIGN_KEY_CHECKS = 0;

-- Clear transactional data
TRUNCATE TABLE `damaged_items`;
TRUNCATE TABLE `return_stock_entries`;
TRUNCATE TABLE `outward_items`;
TRUNCATE TABLE `outward_entries`;
TRUNCATE TABLE `shipping_bill_items`;
TRUNCATE TABLE `shipping_bills`;
TRUNCATE TABLE `inward_items`;
TRUNCATE TABLE `inward_entries`;
TRUNCATE TABLE `items`;

-- Reset auto-increments for cleared tables
ALTER TABLE `damaged_items` AUTO_INCREMENT = 1;
ALTER TABLE `return_stock_entries` AUTO_INCREMENT = 1;
ALTER TABLE `outward_items` AUTO_INCREMENT = 1;
ALTER TABLE `outward_entries` AUTO_INCREMENT = 1;
ALTER TABLE `shipping_bill_items` AUTO_INCREMENT = 1;
ALTER TABLE `shipping_bills` AUTO_INCREMENT = 1;
ALTER TABLE `inward_items` AUTO_INCREMENT = 1;
ALTER TABLE `inward_entries` AUTO_INCREMENT = 1;
ALTER TABLE `items` AUTO_INCREMENT = 1;

-- Note: USERS, BRANCHES, CONSIGNMENTS, COUNTRIES, FLIGHT_NUMBERS are NOT cleared.

SET FOREIGN_KEY_CHECKS = 1;
