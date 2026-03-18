-- Seed data for CAFS Inventory System

-- Sample consignments (airlines) with airline codes
INSERT IGNORE INTO consignments (name, code, airline_code, type) VALUES 
('SPICEJET LTD', 'SG', 'SG', 'AIRLINE'),
('AIR INDIA', 'AI', 'AI', 'AIRLINE'),
('INDIGO', '6E', '6E', 'AIRLINE'),
('VISTARA', 'UK', 'UK', 'AIRLINE'),
('GO FIRST', 'G8', 'G8', 'AIRLINE'),
('AIR ASIA', 'I5', 'I5', 'AIRLINE');

-- Sample consignment locations
INSERT IGNORE INTO consignments (name, code, type, address) VALUES 
('ERNAKULAM', 'EKM', 'LOCATION', 'Ernakulam, Kerala'),
('CHENNAI', 'MAA', 'LOCATION', 'Chennai, Tamil Nadu'),
('MUMBAI', 'BOM', 'LOCATION', 'Mumbai, Maharashtra'),
('DELHI', 'DEL', 'LOCATION', 'New Delhi');

-- Sample ship consignments
INSERT IGNORE INTO consignments (name, type, address) VALUES
('MAERSK LINE', 'SHIP', 'Copenhagen, Denmark'),
('MSC - Mediterranean Shipping', 'SHIP', 'Geneva, Switzerland');

-- Sample road transport
INSERT IGNORE INTO consignments (name, type) VALUES
('Road Transport', 'ROAD');

-- Sample items from the registers
INSERT IGNORE INTO items (description, unit) VALUES 
('J W BLACK LABEL 5 CL', 'PCS'),
('BEER-BUDWEISER CANS 35.5 CL', 'PCS'),
('VODKA STOLI PREMIUM MINI 5CL', 'PCS'),
('GLENMORAY 12YO 5 CL', 'PCS'),
('ALBERT BICHOT MOULINS', 'PCS'),
('2019 CHATEAU TEYSSIER 75CL', 'PCS'),
('RAMPUR DOUBLE CASK 750ML', 'PCS'),
('MONKEY SHOULDER 50ML', 'PCS'),
('JACK DANIELS WHISKY 100CL', 'PCS'),
('ROKU GIN 70CL', 'PCS'),
('1000 RESERVA ANEJO 50ML', 'PCS'),
('BAILEYS IRISH CREAM LIQUEUR 100CL', 'PCS'),
('BACARDI RONCARTA BLANCA 1000ML', 'PCS'),
('VODKA GREY GOOSE 1000ML', 'PCS'),
('ABSOLUT ORIGINAL VODKA 1000ML', 'PCS'),
('DEWARS WHITE LABEL WHISKY 1000ML', 'PCS'),
('GLENLIVET SINGLE MALT WHISKY 1000ML', 'PCS'),
('MADEIRA ABERFELDY 16 WHISKY', 'PCS'),
('SAINT CLAIR GRIMM 750ML', 'PCS'),
('2021 CHATEAU DU MONTHLY RLV', 'PCS'),
('HENLEY CAMP GRANSER 8.7 CL 40W', 'PCS'),
('HENLEY STAMP GHASAR CIL 18 CLOW', 'PCS');
