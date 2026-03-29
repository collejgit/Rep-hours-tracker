const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'change_this_password';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'rep_hours.db');

// ── Ensure data directory exists ─────────────────
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ── Initialize SQLite ────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

console.log(`Database initialized at ${DB_PATH}`);

// ── Middleware ────────────────────────────────────
app.use(cors());
app.use(express.json());
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

// ── Routes ───────────────────────────────────────

// POST /api/auth
app.post('/api/auth', (req, res) => {
  const { password } = req.body || {};
  if (password === APP_PASSWORD) {
    return res.json({ success: true, token: generateToken(), user: 'michele' });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// GET /api/entries?year=2026
app.get('/api/entries', authenticate, (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();

  const entries = db.prepare(
    "SELECT * FROM entries WHERE strftime('%Y', entry_date) = ? ORDER BY entry_date DESC, created_at DESC"
  ).all(year);

  // Compute summaries
  let totalHours = 0, totalMileage = 0;
  const dates = new Set();
  const monthlyMap = {};
  const catMap = {};
  const propMap = {};

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

  const monthly = Object.entries(monthlyMap)
    .map(([month, total]) => ({ month: parseInt(month), total }));

  const categories = Object.entries(catMap)
    .map(([category, d]) => ({ category, ...d }))
    .sort((a, b) => b.total - a.total);

  const properties = Object.entries(propMap)
    .map(([property, d]) => ({ property, ...d }))
    .sort((a, b) => b.total - a.total);

  res.json({
    entries,
    summary: {
      total_entries: entries.length,
      total_hours: totalHours,
      total_mileage: totalMileage,
      unique_days: dates.size,
    },
    monthly,
    categories,
    properties,
  });
});

// POST /api/entries
app.post('/api/entries', authenticate, (req, res) => {
  const { entry_date, hours, minutes, category, property, description, mileage } = req.body;
  if (!entry_date || !hours || !category) {
    return res.status(400).json({ error: 'Missing required fields: entry_date, hours, category' });
  }

  const stmt = db.prepare(
    `INSERT INTO entries (entry_date, hours, minutes, category, property, description, mileage)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    entry_date,
    parseFloat(hours),
    parseInt(minutes || 0),
    category,
    property || 'all',
    description || '',
    mileage ? parseFloat(mileage) : null
  );

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, entry });
});

// PUT /api/entries
app.put('/api/entries', authenticate, (req, res) => {
  const { id, entry_date, hours, minutes, category, property, description, mileage } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing entry ID' });

  db.prepare(
    `UPDATE entries SET
      entry_date = ?, hours = ?, minutes = ?, category = ?,
      property = ?, description = ?, mileage = ?,
      updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    entry_date,
    parseFloat(hours),
    parseInt(minutes || 0),
    category,
    property || 'all',
    description || '',
    mileage ? parseFloat(mileage) : null,
    parseInt(id)
  );

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(parseInt(id));
  res.json({ success: true, entry });
});

// DELETE /api/entries/:id
app.delete('/api/entries/:id', authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  res.json({ success: true, deleted: id });
});

// GET /api/export?year=2026
app.get('/api/export', authenticate, (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();

  const entries = db.prepare(
    "SELECT * FROM entries WHERE strftime('%Y', entry_date) = ? ORDER BY entry_date ASC, created_at ASC"
  ).all(year);

  const catLabels = {
    property_mgmt: 'Property Management',
    repairs: 'Repairs & Maintenance',
    construction: 'Construction / Improvements',
    travel: 'Travel (NJ to NC)',
    bookings: 'Booking & Guest Mgmt',
    records: 'Records & Accounting',
    cleaning: 'Cleaning & Turnover',
    communication: 'Calls / Emails / Texts',
    shopping: 'Shopping for Properties',
    inspection: 'Inspections & Walkthroughs',
    other: 'Other RE Activity',
  };
  const propLabels = {
    all: 'All Properties', salt_house: 'Salt House', kdh: 'KDH', lighthouse: 'Lighthouse',
  };

  let totalHours = 0, totalMileage = 0;
  const rows = ['Date,Hours,Category,Property,Description,Mileage,Created'];

  for (const e of entries) {
    totalHours += e.hours;
    totalMileage += e.mileage || 0;
    const desc = (e.description || '').replace(/"/g, '""');
    rows.push([
      e.entry_date,
      e.hours.toFixed(2),
      catLabels[e.category] || e.category,
      propLabels[e.property] || e.property,
      `"${desc}"`,
      e.mileage ? e.mileage.toFixed(1) : '',
      e.created_at || '',
    ].join(','));
  }

  rows.push('');
  rows.push('SUMMARY');
  rows.push(`Total Hours,${totalHours.toFixed(2)}`);
  rows.push('Goal,750.00');
  rows.push(`Status,${totalHours >= 750 ? 'MET' : 'NOT MET'}`);
  rows.push(`Total Mileage,${totalMileage.toFixed(1)}`);
  rows.push(`Total Entries,${entries.length}`);
  rows.push(`Year,${year}`);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=REP_Hours_${year}.csv`);
  res.send(rows.join('\n'));
});

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`REP Hours Tracker running on port ${PORT}`);
});
