-- Add new tables to local SQLite
CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    address TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'STAFF',
    branch_id INTEGER,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

-- ADD branch_id to entries if not exists
-- (SQLite doesn't support ADD COLUMN IF NOT EXISTS easily without PRAGMA)
PRAGMA foreign_keys=OFF;
ALTER TABLE inward_entries ADD COLUMN branch_id INTEGER;
ALTER TABLE outward_entries ADD COLUMN branch_id INTEGER;
PRAGMA foreign_keys=ON;
