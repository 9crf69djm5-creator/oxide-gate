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
- Env: `VITE_API_BASE_URL`, `VITE_DISCORD_INVITE` (see `.env.example`)
- Buy page includes **Pay with Roblox** cards (catalog links + claim form). Product IDs live on **gate-api** env (`ROBLOX_ASSET_WEEK`, etc.).

Deploy: [DEPLOY.md](../DEPLOY.md)
