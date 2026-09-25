# OXIDE Gate (website)

**Prefer the React app:** [`../gate-site`](../gate-site) — Vite + Framer Motion, deployed to Vercel.

This `gate/` folder is the legacy static HTML (still works). Discord: https://discord.gg/3PXJ8r56T

## Open locally (React — recommended)

```bash
cd gate-api && npm install && npm start
cd gate-site && npm install && npm run dev
```

See **[DEPLOY.md](../DEPLOY.md)** for free hosting (Vercel + Render).

## Open locally (legacy static)

```bash
cd gate-api && npm start
cd gate && python -m http.server 8080
```

## Configure

- React: `gate-site/src/config.js` or `VITE_API_BASE_URL`
- Legacy: `js/config.js` → `API_BASE_URL`, `discordInvite`

Demo keys: `OXIDE-DEMO-WEEK`, `OXIDE-DEMO-MONTH`, `OXIDE-DEMO-LIFE`.
