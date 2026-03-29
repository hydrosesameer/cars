const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./database/db");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Make db available to routes
app.locals.db = pool;

const authRouter = require("./routes/auth");
app.use("/api/auth", authRouter);

// Redirect root to login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Import routes
const itemsRouter = require("./routes/items");
const consignmentsRouter = require("./routes/consignments");
const inwardRouter = require("./routes/inward");
const outwardRouter = require("./routes/outward");
const reportsRouter = require("./routes/reports");
const shippingBillsRouter = require("./routes/shipping-bills");
const damagedRouter = require("./routes/damaged");
const returnStockRouter = require("./routes/return-stock");

// Use routes
const usersRouter = require("./routes/users");
const branchesRouter = require("./routes/branches");

app.use("/api/items", itemsRouter);
app.use("/api/consignments", consignmentsRouter);
app.use("/api/inward", inwardRouter);
app.use("/api/outward", outwardRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/shipping-bills", shippingBillsRouter);
app.use("/api/damaged", damagedRouter);
app.use("/api/return-stock", returnStockRouter);
app.use("/api/users", usersRouter);
app.use("/api/branches", branchesRouter);
const searchRouter = require("./routes/search");
app.use("/api/search", searchRouter);
const countriesRouter = require("./routes/countries");
app.use("/api/countries", countriesRouter);
const bulkUploadRouter = require("./routes/bulk-upload");
app.use("/api/bulk-upload", bulkUploadRouter);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ SERVER ERROR:", err.stack);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: err.message,
    details: process.env.NODE_ENV === 'production' ? 'See server logs' : err.stack 
  });
});

async function initDB() {
    console.log("Initializing database...");
    try {
        // Test connection
        await pool.query("SELECT 1");
        console.log("✅ Database connection successful");

        const schemaPath = path.join(__dirname, "database", "schema.sql");
        if (fs.existsSync(schemaPath)) {
            try {
                const schema = fs.readFileSync(schemaPath, "utf8");
                await pool.query(schema);
                console.log("✅ Schema check complete");
            } catch (err) {
                if (err.code === 'ER_TABLE_EXISTS_ERROR') {
                    console.log("✅ Schema existing tables verified.");
                } else {
                    console.error("Schema initialization non-fatal error:", err.message);
                }
            }
        }
        
        const [rows] = await pool.query("SHOW TABLES LIKE 'items'");
        if (rows.length > 0) {
            const [countRows] = await pool.query("SELECT COUNT(*) as count FROM items");
            if (countRows[0].count === 0) {
                const seedPath = path.join(__dirname, "database", "seed.sql");
                if (fs.existsSync(seedPath)) {
                    const seed = fs.readFileSync(seedPath, "utf8");
                    await pool.query(seed);
                    console.log("✅ Database seeded with initial data");
                }
            }
        }
        
        // Migrations - safely add missing columns/tables
        const migrations = [
          { table: 'outward_entries', column: 'shipping_bill_id', sql: 'ALTER TABLE outward_entries ADD COLUMN shipping_bill_id INT REFERENCES shipping_bills(id)' },
          { table: 'inward_items', column: 'duty_percent', sql: 'ALTER TABLE inward_items ADD COLUMN duty_percent VARCHAR(50)' },
          { table: 'inward_entries', column: 'branch_id', sql: 'ALTER TABLE inward_entries ADD COLUMN branch_id INT REFERENCES branches(id)' },
          { table: 'outward_entries', column: 'branch_id', sql: 'ALTER TABLE outward_entries ADD COLUMN branch_id INT REFERENCES branches(id)' },
          { table: 'shipping_bills', column: 'shipping_bill_no', sql: 'ALTER TABLE shipping_bills ADD COLUMN shipping_bill_no VARCHAR(50)' },
          { table: 'shipping_bills', column: 'shipping_bill_date', sql: 'ALTER TABLE shipping_bills ADD COLUMN shipping_bill_date DATE' },
          { table: 'shipping_bills', column: 'flight_no', sql: 'ALTER TABLE shipping_bills ADD COLUMN flight_no VARCHAR(50)' },
          { table: 'shipping_bills', column: 'etd', sql: 'ALTER TABLE shipping_bills ADD COLUMN etd DATE' },
          { table: 'shipping_bills', column: 'vt', sql: 'ALTER TABLE shipping_bills ADD COLUMN vt VARCHAR(50)' },
          { table: 'shipping_bills', column: 'port_of_discharge', sql: 'ALTER TABLE shipping_bills ADD COLUMN port_of_discharge VARCHAR(100)' },
          { table: 'shipping_bills', column: 'country_of_destination', sql: 'ALTER TABLE shipping_bills ADD COLUMN country_of_destination VARCHAR(100)' },
          { table: 'shipping_bills', column: 'station', sql: 'ALTER TABLE shipping_bills ADD COLUMN station VARCHAR(100)' },
          { table: 'shipping_bills', column: 'exporter_name', sql: 'ALTER TABLE shipping_bills ADD COLUMN exporter_name VARCHAR(255)' },
          { table: 'shipping_bills', column: 'entered_no', sql: 'ALTER TABLE shipping_bills ADD COLUMN entered_no VARCHAR(50)' },
          { table: 'shipping_bills', column: 'branch_id', sql: 'ALTER TABLE shipping_bills ADD COLUMN branch_id INT' },
          { table: 'damaged_items', column: 'branch_id', sql: 'ALTER TABLE damaged_items ADD COLUMN branch_id INT' },
          { table: 'damaged_items', column: 'inward_id', sql: 'ALTER TABLE damaged_items ADD COLUMN inward_id INT' },
          { table: 'damaged_items', column: 'remarks', sql: 'ALTER TABLE damaged_items ADD COLUMN remarks TEXT' },
          { table: 'return_stock_entries', column: 'branch_id', sql: 'ALTER TABLE return_stock_entries ADD COLUMN branch_id INT' },
          { table: 'users', column: 'role', sql: "ALTER TABLE users MODIFY COLUMN role ENUM('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'APPROVER', 'STAFF') NOT NULL DEFAULT 'STAFF'" },
          { table: 'inward_items', column: 'bond_date', sql: 'ALTER TABLE inward_items ADD COLUMN bond_date DATE' },
          { table: 'inward_items', column: 'bond_expiry', sql: 'ALTER TABLE inward_items ADD COLUMN bond_expiry DATE' },
          { table: 'branches', column: 'shipping_place', sql: 'ALTER TABLE branches ADD COLUMN shipping_place VARCHAR(255)' },
          { table: 'inward_items', column: 'extension_status', sql: "ALTER TABLE inward_items ADD COLUMN extension_status ENUM('NONE', 'APPLIED') DEFAULT 'NONE'" }
        ];

        for (const m of migrations) {
          try {
            const [cols] = await pool.query(`SHOW COLUMNS FROM ${m.table}`);
            if (!cols.find(c => c.Field === m.column)) {
              await pool.query(m.sql);
              console.log(`Migration: Added ${m.column} to ${m.table}`);
            }
          } catch (e) {
            console.log(`Migration check (${m.table}.${m.column}):`, e.message);
          }
        }

        // Ensure flight_numbers table exists
        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS flight_numbers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            consignment_id INT NOT NULL,
            flight_no VARCHAR(50) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (consignment_id) REFERENCES consignments(id) ON DELETE CASCADE
          )`);
        } catch(e) { console.log('flight_numbers table check:', e.message); }

        // Ensure countries table exists
        try {
          await pool.query(`CREATE TABLE IF NOT EXISTS countries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            code VARCHAR(10) NOT NULL,
            port_of_discharge VARCHAR(100),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`);
        } catch(e) { console.log('countries table check:', e.message); }

        // Ensure super admin exists
        try {
          const bcrypt = require('bcryptjs');
          const [users] = await pool.query("SELECT id FROM users WHERE username = 'cafscochin'");
          if (users.length === 0) {
            const hash = await bcrypt.hash('cafs@2025', 10);
            await pool.query("INSERT INTO users (username, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?)",
              ['cafscochin', hash, 'Super Admin', 'SUPER_ADMIN', 'ACTIVE']);
            console.log("✅ Super Admin seeded (cafscochin / cafs@2025)");
          }
        } catch(e) { console.log('Admin seed check:', e.message); }
    } catch(err) {
        console.error("❌ Failed to initialize database:", err.message);
        console.error("Please ensure MYSQL_URL is correctly set in Railway environment variables.");
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CAFS Inventory Server running at http://0.0.0.0:${PORT}`);
    initDB();
});
