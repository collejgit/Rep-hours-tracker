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
console.log(`Upload directory: ${UPLOAD_DIR}`);

// ── Middleware ────────────────────────────────────
app.use(cors());
// Skip JSON parsing for multipart uploads (multer handles those)
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) return next();
  express.json({ limit: '10mb' })(req, res, next);
});
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
      address: '925 Lighthouse Drive, Corolla, NC 27927',
      position: 'Oceanfront',
      bedrooms: 8,
      bathrooms: 6,
      bathDetails: '6 Full',
      sleeps: 20,
      petFriendly: true,
      amenities: ['Heated Pool', 'Hot Tub', 'Pool Table', 'Theater Room', 'WiFi', 'Pet-Friendly', 'Gas Grill', 'Foosball', 'Basketball Hoop', 'Ocean Views'],
      description: 'Start your Outer Banks getaway Where the Light Began in Corolla! Situated directly on the oceanfront in Corolla\'s peaceful Whalehead community, incredible unobstructed ocean views are yours throughout your vacation. Recently upgraded with luxury LVP flooring, professional-grade kitchen appliances, a dedicated home theater with 84" Mini-LED TV and Dolby Atmos sound, and brand-new outdoor amenities including a heated pool and hot tub. The open great room, spacious kitchen, and multiple decks create the perfect setting for gathering with family after a beach day.',
      highlights: [
        'Direct oceanfront with unobstructed Atlantic views',
        'Dedicated theater room with 84" TV and Dolby Atmos surround sound',
        'Heated private pool, hot tub, and new Weber Genesis BBQ',
        'Pet-friendly — every member of the family is welcome',
        'Recently renovated with luxury finishes throughout',
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

app.post('/api/photos', authenticate, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'Upload failed: ' + err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { property_key, caption } = req.body;
    if (!property_key) return res.status(400).json({ error: 'Missing property_key' });

    console.log(`Photo uploaded: ${req.file.filename} for ${property_key}`);

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

// GET photos for a specific property (admin use)
app.get('/api/photos/:property_key', authenticate, (req, res) => {
  const photos = db.prepare(
    'SELECT * FROM property_photos WHERE property_key = ? ORDER BY sort_order ASC'
  ).all(req.params.property_key);
  res.json(photos.map(p => ({
    id: p.id,
    property_key: p.property_key,
    url: `/uploads/${p.filename}`,
    filename: p.filename,
    caption: p.caption,
    sort_order: p.sort_order,
  })));
});

// Update caption for a photo
app.put('/api/photos/:id/caption', authenticate, (req, res) => {
  const { caption } = req.body;
  db.prepare('UPDATE property_photos SET caption = ? WHERE id = ?').run(caption || '', parseInt(req.params.id));
  res.json({ success: true });
});

// ══════════════════════════════════════════════════
// EXPENSE TRACKER API (Phase 3)
// ══════════════════════════════════════════════════

// GET /api/expenses?year=2026
app.get('/api/expenses', authenticate, (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();
  const expenses = db.prepare(
    "SELECT * FROM expenses WHERE strftime('%Y', expense_date) = ? ORDER BY expense_date DESC, created_at DESC"
  ).all(year);

  let totalAmount = 0;
  const catMap = {}, propMap = {}, monthlyMap = {};

  for (const e of expenses) {
    totalAmount += e.amount;
    const month = parseInt(e.expense_date.split('-')[1], 10);
    monthlyMap[month] = (monthlyMap[month] || 0) + e.amount;
    if (!catMap[e.category]) catMap[e.category] = { total: 0, count: 0 };
    catMap[e.category].total += e.amount;
    catMap[e.category].count++;
    if (!propMap[e.property]) propMap[e.property] = { total: 0, count: 0 };
    propMap[e.property].total += e.amount;
    propMap[e.property].count++;
  }

  res.json({
    expenses,
    summary: { total_amount: totalAmount, total_count: expenses.length },
    monthly: Object.entries(monthlyMap).map(([m, t]) => ({ month: parseInt(m), total: t })),
    categories: Object.entries(catMap).map(([c, d]) => ({ category: c, ...d })).sort((a, b) => b.total - a.total),
    properties: Object.entries(propMap).map(([p, d]) => ({ property: p, ...d })).sort((a, b) => b.total - a.total),
  });
});

// POST /api/expenses
app.post('/api/expenses', authenticate, (req, res) => {
  const { expense_date, amount, category, property, vendor, description, receipt_filename } = req.body;
  if (!expense_date || !amount || !category) return res.status(400).json({ error: 'Missing required fields' });
  const result = db.prepare(
    'INSERT INTO expenses (expense_date, amount, category, property, vendor, description, receipt_filename) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(expense_date, parseFloat(amount), category, property || 'all', vendor || '', description || '', receipt_filename || null);
  const entry = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, expense: entry });
});

// PUT /api/expenses
app.put('/api/expenses', authenticate, (req, res) => {
  const { id, expense_date, amount, category, property, vendor, description } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing expense ID' });
  db.prepare(
    "UPDATE expenses SET expense_date=?, amount=?, category=?, property=?, vendor=?, description=?, updated_at=datetime('now','localtime') WHERE id=?"
  ).run(expense_date, parseFloat(amount), category, property || 'all', vendor || '', description || '', parseInt(id));
  const entry = db.prepare('SELECT * FROM expenses WHERE id = ?').get(parseInt(id));
  res.json({ success: true, expense: entry });
});

// DELETE /api/expenses/:id
app.delete('/api/expenses/:id', authenticate, (req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(parseInt(req.params.id));
  if (expense && expense.receipt_filename) {
    const filepath = path.join(UPLOAD_DIR, expense.receipt_filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// POST /api/expenses/upload-receipt — Upload receipt image and store it
app.post('/api/expenses/upload-receipt', authenticate, (req, res, next) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Upload failed: ' + err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({
      success: true,
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
    });
  });
});

// POST /api/expenses/ocr — Server-side OCR via Claude API
app.post('/api/expenses/ocr', authenticate, async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Missing filename' });

  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });

  try {
    const fileBuffer = fs.readFileSync(filepath);
    const base64 = fileBuffer.toString('base64');
    const ext = path.extname(filename).toLowerCase();
    const mediaTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    const mediaType = mediaTypes[ext] || 'image/jpeg';

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6-20250217',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extract the following from this receipt and respond ONLY with a JSON object (no markdown, no backticks): {"date":"YYYY-MM-DD","amount":number,"vendor":"store/company name","description":"brief description of items/services","category":"one of: repairs, capital, supplies, utilities, insurance, taxes, management, cleaning, travel, furnishing, landscaping, legal, marketing, mortgage, other"}. If you cannot determine a field, use null.' },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Claude API error:', anthropicRes.status, errText);
      return res.status(502).json({ error: 'OCR service error', details: errText });
    }

    const anthropicData = await anthropicRes.json();
    const text = anthropicData.content?.find(c => c.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(clean);
      res.json({ success: true, parsed });
    } catch (pe) {
      console.error('OCR parse error:', pe, clean);
      res.json({ success: true, parsed: null, raw: clean });
    }
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR failed: ' + err.message });
  }
});

// GET /api/expenses/export?year=2026
app.get('/api/expenses/export', authenticate, (req, res) => {
  const year = req.query.year || new Date().getFullYear().toString();
  const expenses = db.prepare(
    "SELECT * FROM expenses WHERE strftime('%Y', expense_date) = ? ORDER BY expense_date ASC"
  ).all(year);

  const rows = ['Date,Amount,Category,Property,Vendor,Description,Receipt'];
  let total = 0;
  for (const e of expenses) {
    total += e.amount;
    const desc = (e.description || '').replace(/"/g, '""');
    const vendor = (e.vendor || '').replace(/"/g, '""');
    rows.push([e.expense_date, e.amount.toFixed(2), e.category, e.property,
      `"${vendor}"`, `"${desc}"`, e.receipt_filename || ''].join(','));
  }
  rows.push('', 'SUMMARY', `Total Expenses,$${total.toFixed(2)}`,
    `Total Entries,${expenses.length}`, `Year,${year}`);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=Expenses_${year}.csv`);
  res.send(rows.join('\n'));
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
