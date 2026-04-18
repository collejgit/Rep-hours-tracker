# Colletti Coastal Properties — v2 Deployment Guide

## What Changed from v1

This update transforms the REP Hours Tracker into a full property business
platform while **preserving all existing REP hours data**.

### New Features
- **Public property showcase** — Beautiful landing page with all 3 OBX properties
  (Laughing Dolphin, C Dolphin, Where the Light Began) with booking links to Twiddy
- **Admin section tabs** — REP Hours, Photos (Phase 2), Expenses (Phase 3)
- **Restructured navigation** — Public site for guests, admin panel for Michele

### What's Preserved
- All existing REP hours entries in SQLite
- Same login password
- Same API endpoints (entries, export)

---

## Updating Your Existing Render Deployment

Since you already have the service running with a persistent disk,
this is just a code update — your data stays safe.

### Step 1: Update Your Local Files

Replace the files in your local `rep-hours-tracker` repo with
the contents of this zip. The key files that changed:

- `server.js` — Extended with properties API, photo routes, new DB tables
- `public/index.html` — Complete rewrite with public + admin UI
- `package.json` — Added multer for photo uploads (Phase 2)
- `render.yaml` — Updated service name and UPLOAD_DIR env var

### Step 2: Push to GitHub

```bash
cd your-repo-folder
git add .
git commit -m "v2: Property showcase + admin restructure"
git push
```

### Step 3: Add UPLOAD_DIR Environment Variable

In your Render dashboard → Service → Environment:

Add this new variable:
- `UPLOAD_DIR` = `/opt/render/project/data/uploads`

Your existing `APP_PASSWORD` and `DB_PATH` stay the same.

### Step 4: Render Auto-Deploys

Render will detect the push and redeploy. The new `server.js` will:
1. Open the existing SQLite database (preserving all entries)
2. Create new tables (property_photos, expenses) if they don't exist
3. Serve the new public + admin frontend

---

## Site Structure After Update

### Public Site (no login required)
- `yourdomain.com` — Hero banner + property showcase
- Three property cards with details and "Book on Twiddy" buttons
- Mobile responsive

### Admin Panel (password protected)
- `yourdomain.com` → Click "Owner Login" → Enter password
- **REP Hours tab** — Same dashboard, logging, history, stats as before
- **Photos tab** — Coming in Phase 2
- **Expenses tab** — Coming in Phase 3
- Back arrow returns to public site

---

## Optional: Custom Domain

If you want this at `colletti.com` or `colletticoastal.com`:

1. In Render → Custom Domains → Add your domain
2. In GoDaddy DNS → Add CNAME record pointing to Render's target
3. Render auto-provisions SSL

---

## Phase 2 (Photos) and Phase 3 (Expenses)

The backend routes and database tables are already created and ready.
Phase 2 will add the photo upload UI and drag-to-reorder functionality.
Phase 3 will add manual expense entry and receipt OCR via Claude's API.

Both phases will be code-only updates — no infrastructure changes needed.
