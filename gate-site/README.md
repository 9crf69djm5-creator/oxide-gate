# OXIDE Gate Site (React)

Vite + React + Framer Motion. Brand: ink + copper.

**Discord:** https://discord.gg/3PXJ8r56T

## Dev

```bash
# API in another terminal
cd ../gate-api && npm start

npm install
npm run dev
```

Open http://localhost:5173

## Build / preview

```bash
npm run build
npm run preview
```

## Config

- `src/config.js` — plans, features, Discord, checkout
- Env: `VITE_API_BASE_URL`, `VITE_DISCORD_INVITE`, `VITE_DISCORD_BOT_HEALTH_URL` (see `.env.example`)
- Status page: `/status` — gate API, Oxide.exe download, products, external/Roblox version match, Discord bot (no secrets)
- Offsets page: `/offsets` — browsable static dump from OXIDE headers via `/api/offsets` (not a live memory dumper)
- Buy page includes **Pay with Roblox** cards (catalog links + claim form). Product IDs live on **gate-api** env (`ROBLOX_ASSET_WEEK`, etc.).

Deploy: [DEPLOY.md](../DEPLOY.md)
