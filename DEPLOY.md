# OXIDE free hosting (Vercel + Render)

Your PC does **not** need to stay on. Frontend on **Vercel** (free). API on **Render** (free web service + disk for SQLite).

Discord invite everywhere: `https://discord.gg/3PXJ8r56T`

---

## 0. Prep (once)

1. Create a free [GitHub](https://github.com) account (recommended) **or** use CLI deploy without Git (steps below).
2. Create free [Render](https://render.com) account.
3. Create free [Vercel](https://vercel.com) account.

If this folder is not a git repo yet:

```bash
cd thenwefuckin-base-main
git init
git add .
git commit -m "OXIDE gate site + API deploy-ready"
```

Push to a new GitHub repo (GitHub → New repository → follow their push instructions).

---

## 1. Deploy API on Render (do this first)

### Option A — Blueprint (`render.yaml`)

1. Open [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect the GitHub repo (or upload if using Render’s git connect).
3. Render reads root `render.yaml` and creates `oxide-gate-api`.
4. Open the service → **Environment** and set:

| Key | Value |
|-----|--------|
| `ADMIN_SECRET` | long random string (password manager) |
| `DOWNLOAD_URL` | public HTTPS URL to `Oxide.exe` (Google Drive direct link, R2, etc.) |
| `CORS_ORIGINS` | leave placeholder for now; update after Vercel URL exists |
| `DISCORD_INVITE` | `https://discord.gg/3PXJ8r56T` |
| `DB_PATH` | `/data/keys.db` (already in blueprint) |
| `ROBLOX_GAMEPASS_WEEK` | Gamepass ID (Week) — preferred |
| `ROBLOX_GAMEPASS_MONTH` | Gamepass ID (Month) — optional |
| `ROBLOX_GAMEPASS_LIFETIME` | Gamepass ID (Lifetime) |
| `ROBLOX_ASSET_WEEK` | Classic shirt asset ID (Week) — fallback if no gamepass |
| `ROBLOX_ASSET_MONTH` | Classic shirt asset ID (Month) — fallback |
| `ROBLOX_COOKIE` | Optional `.ROBLOSECURITY` if ownership checks need auth |
| `DEMO_ROBLOX` | `0` in production; `1` only for testing without purchases |

5. Confirm a **persistent disk** is mounted at `/data` (blueprint includes this).
6. Deploy → wait until status is **Live**.
7. Copy the service URL, e.g. `https://oxide-gate-api.onrender.com`.
8. Test: open `https://YOUR-API.onrender.com/api/health` — should return `{ "ok": true, ... }`.
9. Test products: `https://YOUR-API.onrender.com/api/products`.
10. **Must-pass persistence check:** health must show either:
   - `"db":"/data/keys.db"` + `"dbEphemeral":false` (paid disk mounted at `/data`), **or**
   - `"dbBackend":"postgres-blob"` + `"dbEphemeral":false` (free Postgres BYTEA backup — path may be `/tmp/oxide-keys.db`).
   If health shows `"db":"./data/keys.db"` with no `dbBackend` / with `"dbEphemeral":true`, keys live on the ephemeral filesystem and **will wipe on redeploy**.

### Fix live API if health shows `./data/keys.db` (dashboard or API)

Blueprint sets `DB_PATH=/data/keys.db` + free Postgres (`DATABASE_URL`). Code auto-picks `/data` when a disk is mounted; otherwise `/tmp` + Postgres blob.

**Dashboard clicks (if API cannot attach a disk on free tier):**

1. Render → **oxide-gate-api** → **Environment**
2. Set `DB_PATH` = `/data/keys.db`
3. Confirm `DATABASE_URL` is linked to **oxide-keys-db** (or paste the Internal Database URL)
4. Set `DEMO_ROBLOX` = `0`
5. Confirm gamepass IDs: `ROBLOX_GAMEPASS_WEEK` / `_MONTH` / `_LIFETIME`
6. **Disks** (Settings → Disks): add disk name `oxide-data`, mount `/data`, ≥1 GB — **requires a paid instance** on most accounts. Skip if staying on free + Postgres blob.
7. **Manual Deploy** → wait **Live**
8. Re-check `GET /api/health` until `dbEphemeral` is `false` (and `db` is `/data/keys.db` if disk attached).
9. Re-mint keys after persistence is confirmed — old ephemeral keys are **not** copied automatically.

### Option B — Manual Web Service

1. **New** → **Web Service** → connect repo.
2. Root directory: `gate-api`
3. Runtime: **Node**
4. Build: `npm install`
5. Start: `npm start`
6. Instance: **Free**
7. Add disk: name `oxide-data`, mount `/data`, size 1 GB
8. Same env vars as the table above (`DB_PATH=/data/keys.db`).

### Option C — Docker

Use `gate-api/Dockerfile`. On Render: **New Web Service** → Docker → root `gate-api` (or repo root with Dockerfile path). Same env + disk.

**Free tier note:** Render spins down after idle; first request can take ~30–60s. That is normal.

---

## 2. Deploy frontend on Vercel

1. Open [Vercel](https://vercel.com) → **Add New** → **Project** → import the GitHub repo.
2. **Root Directory** → `gate-site` (important).
3. Framework: Vite (auto-detected). Build `npm run build`, output `dist`.
4. **Environment Variables**:

| Key | Value |
|-----|--------|
| `VITE_API_BASE_URL` | `https://YOUR-API.onrender.com` (no trailing slash) |
| `VITE_DISCORD_INVITE` | `https://discord.gg/3PXJ8r56T` |

5. Deploy → copy the site URL, e.g. `https://oxide-gate.vercel.app`.

### Without GitHub (Vercel CLI)

```bash
cd gate-site
npm install
npm i -g vercel
vercel login
vercel
# Production:
vercel --prod
```

When prompted for env, set `VITE_API_BASE_URL` to your Render URL.

---

## 3. Wire CORS (required)

Back on Render → `oxide-gate-api` → Environment → set:

```text
CORS_ORIGINS=https://YOUR-SITE.vercel.app,https://YOUR-SITE.vercel.app
```

(Add any custom domain too.) Redeploy or restart the service.

Also set `DOWNLOAD_URL` to a real public file URL if you have not yet.

---

## 4. Point Oxide.exe at the hosted API

Next to `Oxide.exe`, create `oxide_auth.ini` (see `oxide_auth.ini.example`):

```ini
api=https://YOUR-API.onrender.com
```

Launch Oxide → enter a redeemed key. Auth calls `/api/validate` on that host. **Do not** leave it pointing at `127.0.0.1` once you stop running the API locally.

---

## 5. Local preview (before / after deploy)

```bash
# Terminal 1 — API
cd gate-api
npm install
npm start

# Terminal 2 — React site
cd gate-site
npm install
npm run dev
```

Open `http://localhost:5173`. Redeem demo keys: `OXIDE-DEMO-WEEK`, `OXIDE-DEMO-MONTH`, `OXIDE-DEMO-LIFE`.

Production build preview:

```bash
cd gate-site
npm run build
npm run preview
```

Legacy static HTML still lives in `gate/` (Discord updated). Prefer `gate-site/` for the polished app.

---

## Env cheat sheet

**gate-api (Render)**

- `PORT` — set by Render automatically
- `ADMIN_SECRET` — create keys via `POST /api/admin/create-keys`
- `DOWNLOAD_URL` — returned after redeem
- `CORS_ORIGINS` — comma-separated frontend origins
- `DB_PATH` — `/data/keys.db` with disk
- `DISCORD_INVITE` — `https://discord.gg/3PXJ8r56T`
- `ROBLOX_GAMEPASS_WEEK` / `ROBLOX_GAMEPASS_MONTH` / `ROBLOX_GAMEPASS_LIFETIME` — preferred Roblox gamepass IDs
- `ROBLOX_ASSET_WEEK` / `ROBLOX_ASSET_MONTH` — shirt fallbacks if gamepass unset
- `ROBLOX_COOKIE` — optional ownership auth
- `DEMO_ROBLOX` — `0` for real sales

**gate-site (Vercel)**

- `VITE_API_BASE_URL` — Render API URL
- `VITE_DISCORD_INVITE` — `https://discord.gg/3PXJ8r56T`

**Oxide.exe**

- `oxide_auth.ini` → `api=https://…`

---

## Roblox buy → claim (production)

### Create game passes

1. Open your experience on [create.roblox.com](https://create.roblox.com) → **Monetization** → **Passes**.
2. Production Game Pass IDs (set these on Render → Environment):

| Plan | Env var | Game Pass ID | buyUrl |
|------|---------|--------------|--------|
| Week | `ROBLOX_GAMEPASS_WEEK` | `1999442394` | `https://www.roblox.com/game-pass/1999442394` |
| Month | `ROBLOX_GAMEPASS_MONTH` | `1999370393` | `https://www.roblox.com/game-pass/1999370393` |
| Lifetime | `ROBLOX_GAMEPASS_LIFETIME` | `1999478401` | `https://www.roblox.com/game-pass/1999478401` |

3. Also on Render:
   - **Delete** `ROBLOX_PRODUCT_MAP` (and `ROBLOX_ASSET_IDS`) if present — they override the vars above and can map week/month to the lifetime pass
   - Clear `ROBLOX_ASSET_WEEK` / `ROBLOX_ASSET_MONTH` (or leave empty) so shirt placeholders do not override
   - `DEMO_ROBLOX=0`
4. Redeploy the API. Verify: `GET /api/products` returns three different `game-pass` buyUrls (table above).

Shirt assets still work via `ROBLOX_ASSET_WEEK` / `ROBLOX_ASSET_MONTH` if you prefer clothing over passes.
---

## Alternatives (also free-ish)

| Piece | Alt |
|-------|-----|
| Frontend | Cloudflare Pages / Netlify (same Vite build; see `gate-site/netlify.toml`) |
| API | Railway trial, Fly.io free allowance — still need persistent volume for SQLite |

Render + Vercel is the path of least resistance for this repo.

---

## Create keys after deploy

```bash
curl -X POST https://YOUR-API.onrender.com/api/admin/create-keys \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -d "{\"plan\":\"premium\",\"count\":5,\"days\":30}"
```

Or from this machine: `cd gate-api && node create-keys.js` (uses local `.env` — point `API` only if you add a remote helper; CLI talks to local DB by default). For production keys, use the curl against Render.
