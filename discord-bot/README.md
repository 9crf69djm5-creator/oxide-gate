# OXIDE Discord Bot

Cloud worker that configures the Discord server, tracks Roblox client versions, checks the gate API, and creates keys. **Runs 24/7 on Render** — you do **not** need to keep it open on your PC.

Invite: https://discord.gg/3PXJ8r56T  
Site: https://oxide-gate-site.vercel.app  
API: https://oxide-gate-api.onrender.com

## One-time cloud setup (recommended)

### 1. Create the Discord application

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name it `OXIDE`.
2. **Bot** → **Add Bot** → **Reset Token** → copy the token (`DISCORD_TOKEN`).
3. Enable **Server Members Intent** (Privileged Gateway Intents) — required for auto **Member** role on join.
4. **OAuth2 → General** → copy **Application ID** (`CLIENT_ID`).
5. **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: **Administrator**
6. Invite the bot to your server.
7. Developer Mode → right‑click server → **Copy Server ID** (`GUILD_ID`).

### 2. Deploy on Render (always-on)

The root [`render.yaml`](../render.yaml) already defines worker **`oxide-discord-bot`**.

1. Push this repo (or sync Blueprint) so Render creates **oxide-discord-bot**.
2. Render dashboard → **oxide-discord-bot** → **Environment** → paste:

| Variable | Value |
|----------|--------|
| `DISCORD_TOKEN` | Bot token (step 1) |
| `CLIENT_ID` | Application ID |
| `GUILD_ID` | Server ID |
| `ADMIN_SECRET` | Same as gate-api (for `/key-create`) |

3. **Manual Deploy** → wait until logs show `Logged in as …`.
4. In Discord run **`/setup`** once (Admin).

That’s the **only** secret you must paste once. After that the bot runs in the cloud forever (free worker may sleep on inactivity on some hosts — Render free workers stay as long as the process is running; redeploy if it stops).

### 3. Server icon (branding)

Upload [`../branding/oxide-icon.png`](../branding/oxide-icon.png) as the Discord **server icon** (Server Settings → Overview).

---

## Local run (optional — not required for production)

```bash
cd discord-bot
cp .env.example .env
# fill DISCORD_TOKEN, CLIENT_ID, GUILD_ID
npm install
npm start
```

---

## What `/setup` creates

**Roles:** Owner, Admin, Staff, Reseller, Customer, Member

**Channels**

| Category | Channels | Access |
|----------|----------|--------|
| INFO | announcements, rules, status, roblox-versions | View for everyone; Staff+ can post |
| SUPPORT | help | Everyone can view/send |
| CUSTOMERS | customer-chat | Customer + Staff+ |
| STAFF | staff-chat, key-logs | Staff+ only |
| RESELLERS | reseller | Reseller + Staff+ |

On join: auto **Member** role (+ optional welcome in `#announcements`).

---

## Commands

| Command | Who | What |
|---------|-----|------|
| `/setup` | Admin | Roles + channels |
| `/roblox-version` | Anyone | Refresh `#roblox-versions` |
| `/status` | Anyone | Gate API health |
| `/redeem` | Anyone | Redeem `OXIDE-…` key → DM + Customer role + download |
| `/mykey` · `/license` | Anyone | Show linked license (after `/redeem`) |
| `/download` | Customer+ / after redeem | Oxide.exe download link |
| `/key-create` | Staff+ | Create license keys (DM buyers or have them `/redeem`) |
| `/role` | Staff+ | Add/remove Member, Customer, Reseller, Staff, Admin |
| `/help` | Anyone | Command list |

### Owner / buyer redeem flow

1. Get a key (`/key-create` as Staff, SellApp, or Roblox claim on the site).
2. In Discord: `/redeem key:OXIDE-XXXX-…`
3. Bot DMs (or ephemeral) plan, expiry, key, and **Download Oxide.exe** button.
4. Launch Oxide.exe → paste the same key when asked (HWID binds on first EXE launch).

### Roblox update alerts

- Polls every 15–30 min (`ROBLOX_POLL_MINUTES`)
- On change: updates embed in `#roblox-versions` and posts **Roblox updated → `version-…`**

---

## Env reference

| Variable | Required | Notes |
|----------|----------|--------|
| `DISCORD_TOKEN` | yes | Bot token |
| `CLIENT_ID` | yes | Application ID |
| `GUILD_ID` | yes | Server ID |
| `API_BASE_URL` | no | Default cloud API |
| `SITE_URL` | no | Default Vercel site |
| `ADMIN_SECRET` | for `/key-create` | Match gate-api |
| `WELCOME_MESSAGE` | no | `true`/`false` |
| `AUTO_SETUP` | no | Auto layout if empty |
| `ROBLOX_POLL_MINUTES` | no | 15–30 |

**Do not commit `.env` or tokens.**
