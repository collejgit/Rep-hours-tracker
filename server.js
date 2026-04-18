const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'change_this_password';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'rep_hours.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');

// ── Ensure directories exist ─────────────────────
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Multer for photo uploads (Phase 2) ───────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Initialize SQLite ────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Original entries table (PRESERVED — no changes)
db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    hours REAL NOT NULL,
    minutes INTEGER DEFAULT 0,
    category TEXT NOT NULL,
    property TEXT NOT NULL DEFAULT 'all',
    description TEXT DEFAULT '',
    mileage REAL DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_date ON entries(entry_date);
`);

// New tables for property photos (Phase 2 ready)
db.exec(`
  CREATE TABLE IF NOT EXISTS property_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    caption TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_photos_prop ON property_photos(property_key);
`);

// Expenses table (Phase 3 ready)
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    property TEXT NOT NULL DEFAULT 'all',
    vendor TEXT DEFAULT '',
    description TEXT DEFAULT '',
    receipt_filename TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
`);

console.log(`Database initialized at ${DB_PATH}`);

// ── Middleware ────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth helpers ─────────────────────────────────
function generateToken() {
  return crypto.createHash('sha256').update(APP_PASSWORD + 'rep_hours_salt').digest('hex');
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.substring(7);
    const expected = generateToken();
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return next();
    }
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// ══════════════════════════════════════════════════
// PUBLIC API — No auth required
// ══════════════════════════════════════════════════

// GET /api/properties — Returns property data for public site
app.get('/api/properties', (req, res) => {
  const properties = [
    {
      key: 'salt_house',
      name: 'Laughing Dolphin',
      code: 'E248',
      location: 'Pine Island, Corolla',
      address: '149 Salt House Rd, Corolla, NC 27949',
      position: 'Oceanfront',
      bedrooms: 6,
      bathrooms: 6,
      bathDetails: '5 Full, 1 Half',
      sleeps: 18,
      petFriendly: true,
      amenities: ['Private Pool', 'Pool Table', 'WiFi', 'Pet-Friendly', 'Ocean Views', 'Sound Views'],
      description: 'Perched on the oceanfront in Pine Island, Laughing Dolphin offers stunning sunrise views over the Atlantic and breathtaking sunset views over the Currituck Sound. This spacious 6-bedroom retreat features an open great room, a beautifully appointed kitchen, and expansive decking on both levels. With direct beach access, a private pool, and dog-friendly accommodations, it\'s the perfect gathering place for families seeking an unforgettable Outer Banks vacation.',
      highlights: [
        'Oceanfront with no homes between you and the beach',
        'Panoramic ocean sunrise and sound sunset views from upper level',
        'Private pool and dog-friendly',
        'Quiet Pine Island location with wide, uncrowded beaches',
      ],
      twiddyUrl: 'https://www.twiddy.com/outer-banks/corolla/pine-island/rentals/laughing-dolphin/',
      twiddyPhone: '866-457-1190',
      mapCoords: { lat: 36.23875, lng: -75.77682 },
    },
    {
      key: 'kdh',
      name: 'C Dolphin',
      code: 'KD1003',
      location: 'Kill Devil Hills',
      address: 'Kill Devil Hills, NC',
      position: 'Oceanfront',
      bedrooms: 10,
      bathrooms: 10,
      bathDetails: '10 Full',
      sleeps: 28,
      petFriendly: false,
      amenities: ['Private Pool', 'Elevator', 'Pool Table', 'WiFi', 'Hot Tub', 'Ocean Views'],
      description: 'C Dolphin is a magnificent 10-bedroom oceanfront estate in Kill Devil Hills, perfect for large family reunions, multi-family vacations, and milestone celebrations. With an elevator for easy access to all levels, a private pool, hot tub, and expansive living areas, this home is designed to bring people together while offering ample space for everyone. Steps from the beach with panoramic Atlantic views.',
      highlights: [
        'Grand 10-bedroom oceanfront estate',
        'Elevator access to all floors',
        'Private pool, hot tub, and pool table',
        'Central OBX location near restaurants and attractions',
      ],
      twiddyUrl: 'https://www.twiddy.com/outer-banks/kill-devil-hills/rentals/c-dolphin/',
      twiddyPhone: '866-457-1190',
      mapCoords: { lat: 36.0148, lng: -75.6613 },
    },
    {
      key: 'lighthouse',
      name: 'Where the Light Began',
      code: 'J10925',
      location: 'Whalehead, Corolla',
      address: 'Whalehead, Corolla, NC 27927',
      position: 'Oceanfront',
      bedrooms: 10,
      bathrooms: 10,
      bathDetails: '10 Full',
      sleeps: 26,
      petFriendly: false,
      amenities: ['Private Pool', 'Elevator', 'Pool Table', 'WiFi', 'Ocean Views'],
      description: 'Where the Light Began is a stunning oceanfront home in the sought-after Whalehead community of Corolla. Named for its proximity to the historic Currituck Beach Lighthouse, this beautifully designed home offers generous living spaces, ocean views from multiple levels, and easy beach access. Minutes from Historic Corolla Village, Whalehead Club, and Corolla\'s best shops and restaurants.',
      highlights: [
        'Oceanfront in prestigious Whalehead community',
        'Named for the nearby Currituck Beach Lighthouse',
        'Elevator, private pool, and spacious entertaining areas',
        'Walking distance to Historic Corolla Village attractions',
      ],
      twiddyUrl: 'https://www.twiddy.com/outer-banks/corolla/whalehead/rentals/where-the-light-began/',
      twiddyPhone: '866-457-1190',
      mapCoords: { lat: 36.3762, lng: -75.8305 },
    },
  ];

  // Attach any uploaded photos
  const photoStmt = db.prepare('SELECT * FROM property_photos WHERE property_key = ? ORDER BY sort_order ASC');
  for (const prop of properties) {
    const photos = photoStmt.all(prop.key);
    prop.photos = photos.map(p => ({
      id: p.id,
      url: `/uploads/${p.filename}`,
      caption: p.caption,
      sort_order: p.sort_order,
    }));
  }

  res.json(properties);
});

// ══════════════════════════════════════════════════
// AUTH API
// ══════════════════════════════════════════════════
app.post('/api/auth', (req, res) => {
  const { password } = req.body || {};
  if (password === APP_PASSWORD) {
    return res.json({ success: true, token: generateToken(), user: 'michele' });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// ══════════════════════════════════════════════════
// REP HOURS API — Unchanged from v1
// ══════════════════════════════════════════════════

app.get('/api/entries', authenticate, (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();
  const entries = db.prepare(
    "SELECT * FROM entries WHERE strftime('%Y', entry_date) = ? ORDER BY entry_date DESC, created_at DESC"
  ).all(year);

  let totalHours = 0, totalMileage = 0;
  const dates = new Set();
  const monthlyMap = {}, catMap = {}, propMap = {};

  for (const e of entries) {
    totalHours += e.hours;
    totalMileage += e.mileage || 0;
    dates.add(e.entry_date);
    const month = parseInt(e.entry_date.split('-')[1], 10);
    monthlyMap[month] = (monthlyMap[month] || 0) + e.hours;
    if (!catMap[e.category]) catMap[e.category] = { total: 0, entry_count: 0 };
    catMap[e.category].total += e.hours;
    catMap[e.category].entry_count++;
    if (!propMap[e.property]) propMap[e.property] = { total: 0, entry_count: 0 };
    propMap[e.property].total += e.hours;
    propMap[e.property].entry_count++;
  }

  res.json({
    entries,
    summary: { total_entries: entries.length, total_hours: totalHours, total_mileage: totalMileage, unique_days: dates.size },
    monthly: Object.entries(monthlyMap).map(([m, t]) => ({ month: parseInt(m), total: t })),
    categories: Object.entries(catMap).map(([c, d]) => ({ category: c, ...d })).sort((a, b) => b.total - a.total),
    properties: Object.entries(propMap).map(([p, d]) => ({ property: p, ...d })).sort((a, b) => b.total - a.total),
  });
});

app.post('/api/entries', authenticate, (req, res) => {
  const { entry_date, hours, minutes, category, property, description, mileage } = req.body;
  if (!entry_date || !hours || !category) return res.status(400).json({ error: 'Missing required fields' });
  const result = db.prepare(
    'INSERT INTO entries (entry_date, hours, minutes, category, property, description, mileage) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(entry_date, parseFloat(hours), parseInt(minutes || 0), category, property || 'all', description || '', mileage ? parseFloat(mileage) : null);
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, entry });
});

app.put('/api/entries', authenticate, (req, res) => {
  const { id, entry_date, hours, minutes, category, property, description, mileage } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing entry ID' });
  db.prepare(
    "UPDATE entries SET entry_date=?, hours=?, minutes=?, category=?, property=?, description=?, mileage=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(entry_date, parseFloat(hours), parseInt(minutes || 0), category, property || 'all', description || '', mileage ? parseFloat(mileage) : null, parseInt(id));
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(parseInt(id));
  res.json({ success: true, entry });
});

app.delete('/api/entries/:id', authenticate, (req, res) => {
  db.prepare('DELETE FROM entries WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true, deleted: parseInt(req.params.id) });
});

app.get('/api/export', authenticate, (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();
  const entries = db.prepare(
    "SELECT * FROM entries WHERE strftime('%Y', entry_date) = ? ORDER BY entry_date ASC"
  ).all(year);

  const catLabels = {
    property_mgmt:'Property Management',repairs:'Repairs & Maintenance',construction:'Construction / Improvements',
    travel:'Travel (NJ to NC)',bookings:'Booking & Guest Mgmt',records:'Records & Accounting',
    cleaning:'Cleaning & Turnover',communication:'Calls / Emails / Texts',shopping:'Shopping for Properties',
    inspection:'Inspections & Walkthroughs',other:'Other RE Activity',
  };
  const propLabels = { all:'All Properties', salt_house:'Salt House', kdh:'KDH', lighthouse:'Lighthouse' };

  let totalH = 0, totalM = 0;
  const rows = ['Date,Hours,Category,Property,Description,Mileage,Created'];
  for (const e of entries) {
    totalH += e.hours; totalM += e.mileage || 0;
    rows.push([e.entry_date, e.hours.toFixed(2), catLabels[e.category]||e.category, propLabels[e.property]||e.property,
      `"${(e.description||'').replace(/"/g,'""')}"`, e.mileage?e.mileage.toFixed(1):'', e.created_at||''].join(','));
  }
  rows.push('','SUMMARY',`Total Hours,${totalH.toFixed(2)}`,'Goal,750.00',`Status,${totalH>=750?'MET':'NOT MET'}`,
    `Total Mileage,${totalM.toFixed(1)}`,`Total Entries,${entries.length}`,`Year,${year}`);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=REP_Hours_${year}.csv`);
  res.send(rows.join('\n'));
});

// ══════════════════════════════════════════════════
// PHOTO MANAGEMENT API (Phase 2 — routes ready)
// ══════════════════════════════════════════════════

app.post('/api/photos', authenticate, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { property_key, caption } = req.body;
  if (!property_key) return res.status(400).json({ error: 'Missing property_key' });

  const maxOrder = db.prepare('SELECT MAX(sort_order) as mx FROM property_photos WHERE property_key = ?').get(property_key);
  const sortOrder = (maxOrder?.mx || 0) + 1;

  const result = db.prepare(
    'INSERT INTO property_photos (property_key, filename, caption, sort_order) VALUES (?, ?, ?, ?)'
  ).run(property_key, req.file.filename, caption || '', sortOrder);

  res.status(201).json({
    success: true,
    photo: { id: result.lastInsertRowid, url: `/uploads/${req.file.filename}`, caption: caption || '', sort_order: sortOrder },
  });
});

app.put('/api/photos/reorder', authenticate, (req, res) => {
  const { orders } = req.body; // [{id, sort_order}, ...]
  if (!orders || !Array.isArray(orders)) return res.status(400).json({ error: 'Missing orders array' });
  const stmt = db.prepare('UPDATE property_photos SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const o of orders) stmt.run(o.sort_order, o.id);
  });
  tx();
  res.json({ success: true });
});

app.delete('/api/photos/:id', authenticate, (req, res) => {
  const photo = db.prepare('SELECT * FROM property_photos WHERE id = ?').get(parseInt(req.params.id));
  if (photo) {
    const filepath = path.join(UPLOAD_DIR, photo.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    db.prepare('DELETE FROM property_photos WHERE id = ?').run(parseInt(req.params.id));
  }
  res.json({ success: true });
});

// ══════════════════════════════════════════════════
// SPA FALLBACK
// ══════════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Colletti Coastal Properties running on port ${PORT}`);
});