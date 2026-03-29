# REP Hours Tracker — Render Deployment Guide

## What You're Deploying

A mobile-friendly web app for Michele to log her 750+ real estate
professional hours. Password-protected, works on phone and desktop,
exports CSV for your CPA.

**Stack:** Express (Node.js) + SQLite + React (single HTML file)

---

## Step 1: Push to GitHub

Create a new GitHub repo and push this project:

```bash
cd rep-hours-render
git init
git add .
git commit -m "REP Hours Tracker"
git remote add origin https://github.com/YOUR_USERNAME/rep-hours-tracker.git
git push -u origin main
```

## Step 2: Create the Render Service

1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect your GitHub account (if not already) and select the repo
4. Configure:

| Setting          | Value                        |
|------------------|------------------------------|
| **Name**         | `rep-hours-tracker`          |
| **Region**       | Ohio (US East) or nearest    |
| **Runtime**      | Node                         |
| **Build Command**| `npm install`                |
| **Start Command**| `node server.js`             |
| **Plan**         | Free (or Starter for no spin-down) |

## Step 3: Add a Persistent Disk

**This is critical** — without it, your data disappears on every deploy.

1. In the Render service settings, scroll to **Disks**
2. Click **Add Disk**
3. Configure:

| Setting        | Value                              |
|----------------|------------------------------------|
| **Name**       | `rep-hours-data`                   |
| **Mount Path** | `/opt/render/project/data`         |
| **Size**       | 1 GB (minimum, more than enough)   |

## Step 4: Set Environment Variables

In the Render service settings → **Environment**:

| Key            | Value                                   |
|----------------|-----------------------------------------|
| `APP_PASSWORD` | Whatever you want Michele's password to be |
| `DB_PATH`      | `/opt/render/project/data/rep_hours.db` |

## Step 5: Deploy

Click **Deploy** (or it auto-deploys from your GitHub push).

Your app will be live at: `https://rep-hours-tracker.onrender.com`
(or whatever name you chose)

---

## For Michele's Phone

1. Open the Render URL in Safari (iPhone) or Chrome (Android)
2. **iPhone:** Tap Share → "Add to Home Screen"
3. **Android:** Tap menu (⋮) → "Add to Home Screen"

---

## About Spin-Down (Free Tier)

On Render's free plan, the service spins down after 15 minutes of
inactivity. The next request takes ~30-50 seconds to spin back up.
After that, it's instant.

**Options to avoid this:**
- **Starter plan ($7/month):** Always-on, no spin-down
- **Free workaround:** Use a free cron service like https://cron-job.org
  to ping your URL every 14 minutes to keep it warm

Since Michele is probably only logging hours a few times per week,
the spin-down may be acceptable — she'll just wait a moment on the
first load of the day.

---

## Optional: Custom Domain

To use something like `hours.jamescolletti.com`:

1. In Render service settings → **Custom Domains**
2. Add `hours.jamescolletti.com`
3. Render gives you a CNAME target
4. In GoDaddy DNS settings, add a CNAME record:
   - **Type:** CNAME
   - **Name:** `hours`
   - **Value:** (the target Render gives you)
5. Wait for DNS propagation (~5-30 minutes)
6. Render auto-provisions SSL — it just works

---

## Updating the App

Just push to GitHub — Render auto-deploys:

```bash
git add .
git commit -m "your changes"
git push
```

The persistent disk keeps your data safe across deploys.

---

## Backing Up Data

The SQLite file lives on Render's persistent disk. To back up:

1. Use the CSV export button in the app (recommended)
2. Or SSH into the Render service (paid plans) and download the .db file

---

## Troubleshooting

**App loads but API calls fail:**
- Check that environment variables are set in Render dashboard
- Look at Render's Logs tab for errors

**Data disappeared after deploy:**
- You probably forgot the persistent disk (Step 3)
- Without it, SQLite writes to ephemeral storage that resets on deploy

**Slow first load:**
- This is the free tier spin-up — takes ~30-50 seconds after inactivity
- Subsequent requests are fast
- Upgrade to Starter ($7/mo) to eliminate this

**"Cannot find module 'better-sqlite3'":**
- Make sure build command is `npm install` (not `npm ci`)
- better-sqlite3 needs to compile native bindings on Render's Linux
