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
| `ROBLOX_ASSET_WEEK` | Classic Shirt / T-Shirt asset ID for Week plan |
| `ROBLOX_ASSET_MONTH` | Classic Shirt / T-Shirt asset ID for Month plan |
| `ROBLOX_GAMEPASS_LIFETIME` | Gamepass ID for Lifetime plan |
| `ROBLOX_PRODUCT_MAP` | Optional JSON map overriding the above |
| `ROBLOX_COOKIE` | Optional `.ROBLOSECURITY` if public inventory checks fail |
| `DEMO_ROBLOX` | `1` to skip ownership checks (testing only) |

Free host setup: see root **[DEPLOY.md](../DEPLOY.md)** (Render + Vercel).

## Roblox payments (Shirt / Gamepass → key)

Customers buy your clothing or gamepass on Roblox, then claim an OXIDE key on the Buy page.

### Create products on Roblox

1. Open [Roblox Create](https://create.roblox.com) → **Creations** → **Development Items** (or Avatar → Clothing).
2. Upload a **Classic Shirt** or **T-Shirt** for Week and Month (set a Robux price).
3. For Lifetime, create a **Game Pass** on your experience and set a price.
4. Copy each **Asset ID** / **Game Pass ID** from the URL (`/catalog/ASSETID` or `/game-pass/ID`).
5. Put them in `gate-api/.env` (and Render Environment):

```env
ROBLOX_ASSET_WEEK=1234567890
ROBLOX_ASSET_MONTH=1234567891
ROBLOX_GAMEPASS_LIFETIME=1234567892
DEMO_ROBLOX=0
# Only if inventory checks return 401/403:
# ROBLOX_COOKIE=.ROBLOSECURITY=...
```

6. Redeploy the API on Render so env vars apply.
7. Test: Buy page → **Buy Shirt on Roblox** → purchase → enter username → **Claim OXIDE key**.

Ownership is checked via public inventory endpoints such as:

`https://inventory.roblox.com/v1/users/{userId}/items/Asset/{assetId}`

Claims are stored in SQLite (`roblox_claims`) keyed by `robloxUserId + assetId`, so one purchase cannot mint infinite keys. Re-claim returns the same key.

Set `DEMO_ROBLOX=1` locally to skip ownership while wiring the UI.

## Endpoints

### `GET /api/products`

Lists plans with Roblox buy links (`https://www.roblox.com/catalog/ASSETID` or game-pass URLs).

### `POST /api/roblox/claim`

Body: `{ "username": "RobloxName", "plan": "week"|"month"|"lifetime" }`

Resolves userId, verifies ownership (unless demo), creates/returns a key bound to that purchase.

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

Stub for future SellApp auto-insert after checkout (returns 501). Still available alongside Roblox claims.

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

1. **Roblox path:** user buys shirt/gamepass → claims on Buy page → redeems key → runs Oxide.exe.
2. **SellApp path (unchanged):** create keys with admin / CLI (or demo keys) → set checkout URLs → redeem on Get a key.
3. **Run Oxide.exe** → enter key → EXE calls `/api/validate` with HWID.
4. Optional later: wire SellApp webhook to auto-insert keys into SQLite.

## Seed only

```bash
npm run seed
```
