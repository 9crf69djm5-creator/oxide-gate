# OXIDE Roblox Dumper

Companion tool that attaches to `RobloxPlayerBeta.exe`, dumps offsets from the live client, writes `offsets.json`, and optionally uploads them to gate-api so https://oxide-gate-site.vercel.app/offsets shows the current set.

## Binary

After build:

```
thenwefuckin-base-main\x64\Release\OxideDumper.exe
```

Build:

```bat
tools\roblox-dumper\scripts\build-dumper.bat
```

## Run (dump)

1. Open Roblox and **fully join an experience** (home screen is not enough for many stages).
2. For **full theo-parity coverage**, also join / open the included dump place (`rblx\game.rbxl` published or the place that contains the ReplicatedStorage bridge StringValues). Attach RVAs still dump without it.
3. Run as Administrator if RPM fails:

```bat
cd x64\Release
OxideDumper.exe
```

Optional output directory:

```bat
OxideDumper.exe "C:\path\to\output"
```

Outputs in the working/output folder: `offsets.json`, `offsets.h`, `offsets.py`, `offsets.cs`, `structs.h`.

## Upload to website

Create `oxide_dumper.ini` next to `OxideDumper.exe` (see `oxide_dumper.ini.example`):

```ini
api=https://oxide-gate-api.onrender.com
adminSecret=YOUR_RENDER_ADMIN_SECRET
```

Or set env vars `OXIDE_API` / `ADMIN_SECRET`.

On success the dumper `POST`s to:

```
POST https://oxide-gate-api.onrender.com/api/admin/offsets
Header: X-Admin-Secret: <ADMIN_SECRET>
```

Public read (site + Oxide.exe):

```
GET https://oxide-gate-api.onrender.com/api/offsets
Page: https://oxide-gate-site.vercel.app/offsets
```

## OXIDE.exe

`Offsets::Live::Refresh()` prefers:

1. Local `offsets.json` beside `Oxide.exe`
2. `GET /api/offsets` on gate-api
3. imtheo fallback

Copy `offsets.json` next to `Oxide.exe` after a dump, or rely on the upload path.
