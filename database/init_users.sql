-- SQLite-compatible seed for users and branches
INSERT INTO branches (name, code, address) VALUES ('Cochin CAFS', 'COK15003', 'Nayathode P.O Angamali Kerala 683572');
INSERT INTO users (username, password_hash, full_name, role, branch_id) 
SELECT 'cafscochin', '$2b$10$xgnSOz/T5zY91AvcrxsrLuguC.D8tRU/cE8eRlMqWVngt5urFOGGi', 'Super Admin', 'SUPER_ADMIN', id 
FROM branches WHERE code = 'COK15003';
