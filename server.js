import express from "express";
import mysql from "mysql2/promise";
import cors from "cors";
import QRCode from "qrcode";
import { nanoid } from "nanoid";

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
    const { name, zone } = req.body;
    if (!name || !zone) return res.status(400).json({ error: "Name or zone missing" });

    // Generate unique QR code token
    const qr_code = nanoid(16);

    // Insert guest into DB
    await db.query(
      "INSERT INTO summit (name, zone, qr_code) VALUES (?, ?, ?)",
      [name, zone, qr_code]
    );

    // Generate QR image (Data URL)
    const qrImage = await QRCode.toDataURL(qr_code);

    res.json({ qr_code, qrImage, name, zone });
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

    const [rows] = await db.query("SELECT * FROM summit WHERE qr_code = ?", [qr_code]);
    if (rows.length === 0) return res.status(404).json({ error: "Guest not found" });

    const guest = rows[0];
    const now = new Date();
    const last = guest.last_scanned ? new Date(guest.last_scanned) : null;

    // Check 45 min rule
    if (last && (now - last) < 45 * 60 * 1000) {
      return res.json({
        name: guest.name,
        zone: guest.zone,
        status: "blocked",
        message: "IMEZUIWA - SUBIRI DK 45",
      });
    }

    // Update last_scanned
    await db.query("UPDATE summit SET last_scanned = ? WHERE id = ?", [now, guest.id]);

    return res.json({
      name: guest.name,
      zone: guest.zone,
      status: "success",
      message: "IMETHIBITISHWA",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Stats (Dashboard) =====
app.get("/stats", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT zone, COUNT(*) AS total,
      SUM(CASE WHEN last_scanned IS NOT NULL THEN 1 ELSE 0 END) AS scanned
      FROM summit
      GROUP BY zone
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===== Recent Scans =====
app.get("/recent-scans", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT name, zone, last_scanned
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

app.listen(4001, () => console.log("Server running on port 4001"));
