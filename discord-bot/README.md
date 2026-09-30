# OXIDE Discord Bot

Cloud worker: verify gate, honeypot anti-spam, pro channel layout, Roblox version intel, gate status, and license tools. Runs 24/7 on Render.

Invite: https://discord.gg/3PXJ8r56T  
Site: https://oxide-gate-site.vercel.app  
Status page: https://oxide-gate-site.vercel.app/status  
API: https://oxide-gate-api.onrender.com

## Deploy / update the bot

1. Push this repo so Render **oxide-discord-bot-fra** rebuilds (or **Manual Deploy**).
2. Confirm env on the service:

| Variable | Value |
|----------|--------|
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application ID |
| `GUILD_ID` | Server ID |
| `ADMIN_SECRET` | **Same** as oxide-gate-api |
| `API_BASE_URL` | `https://oxide-gate-api.onrender.com` |

3. Discord Developer Portal → Bot → enable **Server Members Intent** (and Message Content only if you need it; honeypot works without reading content).
4. Wait for logs: `Logged in as …` and `Slash commands registered.`
5. In Discord (as server Admin) run **`/setup-server` once**.

### After `/setup-server`

1. **Server Settings → Roles** — drag the bot’s role **above Citizen** (required for verify + kicks).
2. Confirm sidebar looks like:

```
━━ VERIFY ━━
  ✅・verify          ← button unlocks Citizen
  🚫・do-not-type     ← honeypot (typing = kick)
━━ INFO ━━
  📢・announcements
  🔔・updates         ← bot posts Oxide releases
  📜・rules
  🟢・status          ← bot posts API status
  🎮・roblox-versions
━━ COMMUNITY ━━
  💬・general
  💡・feedback
━━ SUPPORT ━━
  🆘・help
━━ CUSTOMERS ━━
  🔒・customer-chat
━━ STAFF ━━
  🔒・staff-chat
  🔒・key-logs
━━ RESELLERS ━━
  🔒・reseller
```

3. New joins only see **VERIFY** until they click **Verify — unlock OXIDE** (or `/verify`).
4. Existing Member/Customer/Staff are auto-granted **Citizen** so they are not locked out.
5. Optional: upload `branding/oxide-icon.png` as the server icon.
6. Keep the free bot awake — ping `https://oxide-discord-bot-fra.onrender.com/` every 5–10 min (UptimeRobot / cron).

`/setup` is an alias of `/setup-server`. Both are idempotent.

---

## Verification + honeypot

| Feature | Behavior |
|---------|----------|
| Verify gate | `@everyone` cannot see INFO/COMMUNITY/… until they have **Citizen** |
| Button | Persistent button in `#verify` → grants Citizen |
| `/verify` | Same as the button |
| Honeypot | Anyone (except Staff+/Admin/bots) who messages `#do-not-type` is **kicked**; message deleted; logged to `#key-logs` |

---

## Commands

### Public (after verify / everyone for verify+help)

| Command | Who | What |
|---------|-----|------|
| `/verify` | Anyone | Get Citizen + unlock server |
| `/ping` | Anyone | Bot latency |
| `/website` · `/site` · `/web` | Anyone | Official site + Buy / Get key / Status / Offsets |
| `/status` | Anyone | API + downloads + products + bot |
| `/products` | Anyone | Plans / gamepass links |
| `/download` | Citizen+ | Oxide.exe link (latest version, cache-busted) |
| `/update` · `/changelog [version]` | Anyone | Latest Oxide.exe version, what changed, download button + attached EXE |
| `/key-redeem` | Anyone | How to redeem |
| `/redeem` · `/bind` | Anyone | Redeem/link key → saved on Discord + API |
| `/mykey` · `/license` | Anyone | Masked key + plan + days left (Reveal button) |
| `/roblox-version` | Anyone | Refresh `#roblox-versions` |
| `/help` | Anyone | Command list |

### Staff+ only

| Command | What |
|---------|------|
| `/key-create` | Mint keys (`ADMIN_SECRET`) |
| `/key-revoke` | Ban a key |
| `/hwid-reset` | Clear HWID bind |
| `/role` | Add/remove Citizen, Customer, Reseller, Staff, Admin |
| `/setup-server` | Layout + verify + honeypot (Admin) |
| `/release-announce [force]` | Post the latest release in the updates channel |

---

## Release announcements

Publishing is one command from the repo root: `.\release.ps1 -Title "..." -NotesFile notes.txt`
(bumps the version in `gate-api/data/releases.json`, builds, copies Oxide.exe to site + API, pushes, verifies, then pings the bot).

- The bot polls `GET /api/releases/latest` on startup and every `RELEASE_POLL_MINUTES` (default 5) and posts an embed
  (version, date, changelog bullets, Download / Changelog / Website buttons) once per version.
- Channel: `UPDATES_CHANNEL_ID` if set, otherwise **#updates** (never #announcements).
- Idempotent: before posting it looks for its own embed with footer `OXIDE release v<version>` in the channel,
  so restarts / redeploys never re-announce.
- It will not announce while the hosted Oxide.exe hash differs from the release (deploy still rolling out).
- The post attaches `Oxide.exe` itself, downloaded from the API (site as fallback) and checked against the release SHA256.
  If the fetch or hash check fails it posts with links only and logs why. An existing post for the same version
  that has no EXE gets the file added by editing it (never reposted). `/download` and `/update` attach the verified EXE too.
- `release.ps1` triggers it instantly via `POST /internal/announce-release` (header `X-Admin-Secret` = `ADMIN_SECRET`).

| Env | Default | Purpose |
|-----|---------|---------|
| `UPDATES_CHANNEL_ID` | _(unset → #updates)_ | Channel for release posts |
| `UPDATES_PING` | _(none)_ | Text before the embed, e.g. `@everyone` or `<@&ROLE_ID>` |
| `RELEASE_POLL_MINUTES` | `5` | How often to check the API for a new release |
| `RELEASE_ANNOUNCE` | `true` | `false` disables auto-announcements |

---

## Local run (optional)

```bash
cd discord-bot
cp .env.example .env
# fill DISCORD_TOKEN, CLIENT_ID, GUILD_ID, ADMIN_SECRET
npm install
npm start
```

Slash commands re-register on bot startup (`register.js`).

**Do not commit `.env` or tokens.**
