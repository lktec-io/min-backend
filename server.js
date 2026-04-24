import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import QRCode from "qrcode";

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "Leonard1234#1234",
  database: "wedding",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

console.log("✅ Connected to MySQL database (using connection pool)");

// ===== Create Guest + Generate QR =====
app.post("/create-guest", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT qr_code FROM summit ORDER BY id DESC LIMIT 1"
    );

    let nextNumber = 1;
    if (rows.length > 0) {
      const lastCode = rows[0].qr_code; // e.g. "CN-007"
      const lastNumber = parseInt(lastCode.replace("CN-", ""), 10);
      if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
    }

    const qr_code = `CN-${String(nextNumber).padStart(3, "0")}`;

    await db.query("INSERT INTO summit (qr_code) VALUES (?)", [qr_code]);

    const qrImage = await QRCode.toDataURL(qr_code);

    res.json({ qr_code, qrImage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Verify QR =====
app.post("/verify", async (req, res) => {
  try {
    const { qr_code } = req.body;
    if (!qr_code) return res.status(400).json({ error: "QR code missing" });

    const [rows] = await db.query(
      "SELECT * FROM summit WHERE qr_code = ?",
      [qr_code]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Guest not found" });

    const guest = rows[0];
    const now = new Date();

    // Check 7-day expiry from created_at
    const createdAt = new Date(guest.created_at);
    const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      return res.json({
        qr_code: guest.qr_code,
        status: "expired",
        message: "Expired - QR code is older than 7 days",
      });
    }

    await db.query("UPDATE summit SET last_scanned = ? WHERE id = ?", [now, guest.id]);

    return res.json({
      qr_code: guest.qr_code,
      status: "success",
      message: "✅ Successfully verified",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Stats (Dashboard) =====
app.get("/stats", async (req, res) => {
  try {
    const [[totals]] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN last_scanned IS NOT NULL THEN 1 ELSE 0 END) AS scanned
      FROM summit
    `);
    res.json(totals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Recent Scans =====
app.get("/recent-scans", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT qr_code, last_scanned
      FROM summit
      WHERE last_scanned IS NOT NULL
      ORDER BY last_scanned DESC
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Delete Guest (Optional Admin) =====
app.delete("/guest/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM summit WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(4001, () => console.log("Server running on port 4001"));
