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
app.use(express.static(path.join(__dirname, "public")));

// Make db available to routes
app.locals.db = pool;

// Auth route (simple hardcoded)
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin123") {
    return res.json({
      token: "cafs-session-" + Date.now(),
      user: { name: "Warehouse Manager", role: "Admin", code: "Cok15003" }
    });
  }
  return res.status(401).json({ error: "Invalid username or password" });
});

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
app.use("/api/items", itemsRouter);
app.use("/api/consignments", consignmentsRouter);
app.use("/api/inward", inwardRouter);
app.use("/api/outward", outwardRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/shipping-bills", shippingBillsRouter);
app.use("/api/damaged", damagedRouter);
app.use("/api/return-stock", returnStockRouter);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

async function initDB() {
    console.log("Initializing database...");
    try {
        // Test connection
        await pool.query("SELECT 1");
        console.log("✅ Database connection successful");

        const schemaPath = path.join(__dirname, "database", "schema.sql");
        if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, "utf8");
            await pool.query(schema);
            console.log("✅ Schema check complete");
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
        
        // Migrations
        try {
            const [cols] = await pool.query("SHOW COLUMNS FROM outward_entries");
            if (!cols.find(c => c.Field === 'shipping_bill_id')) {
                await pool.query("ALTER TABLE outward_entries ADD COLUMN shipping_bill_id INT REFERENCES shipping_bills(id)");
                console.log("Migration: Added shipping_bill_id to outward_entries");
            }
        } catch (e) {
            console.log("Migration check:", e.message);
        }
    } catch(err) {
        console.error("❌ Failed to initialize database:", err.message);
        console.error("Please ensure MYSQL_URL is correctly set in Railway environment variables.");
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CAFS Inventory Server running at http://0.0.0.0:${PORT}`);
    initDB();
});
