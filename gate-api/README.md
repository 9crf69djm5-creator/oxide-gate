# OXIDE Gate API

Local license server for the gate website and Oxide.exe.

## Quick start

```bash
cd gate-api
copy .env.example .env   # Windows; or cp .env.example .env
npm install
npm start
```

API listens on `http://127.0.0.1:8787` by default.

Demo keys are seeded automatically on boot:

- `OXIDE-DEMO-WEEK` (week / 7 days)
- `OXIDE-DEMO-MONTH` (month / 30 days)
- `OXIDE-DEMO-LIFE` (lifetime)

## Environment (`.env`)

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `8787`) |
| `ADMIN_SECRET` | Required for `POST /api/admin/create-keys` |
| `DOWNLOAD_URL` | Returned after redeem (CDN or local path URL) |
| `CORS_ORIGINS` | Comma-separated allowed origins for the gate site |
| `DB_PATH` | Optional SQLite path (default `./data/keys.db`; on Render use `/data/keys.db`) |
| `DISCORD_INVITE` | `https://discord.gg/3PXJ8r56T` |

Free host setup: see root **[DEPLOY.md](../DEPLOY.md)** (Render + Vercel).

## Endpoints

### `POST /api/redeem`

Website redeem. Body: `{ "key": "OXIDE-....", "hwid": "optional" }`

Returns `{ ok, plan, expires, downloadUrl, token }`.

### `POST /api/validate`

Oxide.exe launch check. Body: `{ "key", "hwid", "token?" }`

- Rejects banned / expired / wrong HWID
- Binds HWID on first use
- Activates unused keys on first EXE validate (same as redeem+bind)

### `POST /api/admin/create-keys`

Header: `X-Admin-Secret: <ADMIN_SECRET>`  
Body: `{ "plan": "week"|"month"|"premium"|"lifetime", "count": 5, "days": 7 }`

`days` ≤ 0 or omit for lifetime plans → no expiry.

Generates keys like `OXIDE-A1B2-C3D4-E5F6`.

### `POST /api/webhooks/sellapp`

Stub for future SellApp auto-insert after checkout (returns 501).

## Create keys (examples)

```bash
# Via HTTP
curl -X POST http://127.0.0.1:8787/api/admin/create-keys ^
  -H "Content-Type: application/json" ^
  -H "X-Admin-Secret: oxide-dev-admin-secret" ^
  -d "{\"plan\":\"week\",\"count\":3,\"days\":7}"

# Via CLI
npm run create-keys -- --plan week --count 3 --days 7
npm run create-keys -- --plan lifetime --count 1
```

## End-to-end flow

1. **Create keys** with admin endpoint / CLI (or use demo keys).
2. **User buys** via SellApp / Stripe / Roblox — set checkout URLs in `gate/js/config.js`. After pay they receive a key (email/Discord).
3. **Redeem** on `gate/key.html` → API activates key → account page shows download.
4. **Run Oxide.exe** → enter key (or cached session) → EXE calls `/api/validate` with HWID.
5. Optional later: wire SellApp webhook to auto-insert keys into SQLite.

## Seed only

```bash
npm run seed
```
