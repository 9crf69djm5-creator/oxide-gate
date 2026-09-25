# OXIDE

Roblox external — ink + copper. License gate site + API.

**Discord:** https://discord.gg/3PXJ8r56T

## Quick local preview

```bash
# API
cd gate-api && npm install && npm start

# Site (new React app)
cd gate-site && npm install && npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). Redeem hits `http://127.0.0.1:8787`.

Demo keys: `OXIDE-DEMO-WEEK`, `OXIDE-DEMO-MONTH`, `OXIDE-DEMO-LIFE`.

## Free hosting

See **[DEPLOY.md](./DEPLOY.md)** — Vercel (frontend) + Render (API). Your PC does not need to stay on.

## Oxide.exe → hosted API

Next to `Oxide.exe`, create `oxide_auth.ini`:

```ini
api=https://YOUR-GATE-API.onrender.com
```

See `oxide_auth.ini.example`.
