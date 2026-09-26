const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const dbModule = require("./lib/db");
const keys = require("./lib/keys");
const claims = require("./lib/claims");
const roblox = require("./lib/roblox");
const externalVersion = require("./lib/external-version");
const offsetsLib = require("./lib/offsets");

const PORT = Number(process.env.PORT) || 8787;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-to-a-long-random-string";
const SITE_EXE_URL = "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";
const DOWNLOAD_URL = safeDownloadUrl(process.env.DOWNLOAD_URL) || SITE_EXE_URL;
const DISCORD_INVITE = process.env.DISCORD_INVITE || "https://discord.gg/3PXJ8r56T";
const downloadsDir = path.join(__dirname, "public", "downloads");

/** Buyers must get Oxide.exe only — never a GitHub source repo tree. */
function safeDownloadUrl(raw) {
  const url = String(raw || "").trim();
  if (!url || /^file:/i.test(url)) return "";
  try {
    const u = new URL(url);
    if (/github\.com$/i.test(u.hostname) && !/\/releases\/download\//i.test(u.pathname)) {
      console.warn("[download] Refusing GitHub repo URL; using site EXE instead:", url);
      return "";
    }
  } catch {
    return "";
  }
  return url;
}

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: "64kb" }));

app.use(
  cors({
    origin(origin, cb) {
      // Allow file:// (null), local gate servers, and configured list
      if (!origin || origin === "null" || corsOrigins.includes(origin) || corsOrigins.includes("*")) {
        return cb(null, true);
      }
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Secret"],
  })
);

/**
 * Public health — no DB paths, secrets, tokens, or internal env.
 */
app.get("/api/health", (_req, res) => {
  const exeMeta = externalVersion.probeHostedExe(downloadsDir, DOWNLOAD_URL);
  const hosted = externalVersion.readHostedClientVersion();
  res.json({
    ok: true,
    service: "oxide-gate-api",
    dbBackend: dbModule.dbBackend,
    dbEphemeral: Boolean(dbModule.dbEphemeral),
    downloadConfigured: Boolean(DOWNLOAD_URL),
    downloadAvailable: Boolean(exeMeta.available),
    downloadSizeBytes: exeMeta.sizeBytes ?? null,
    downloadModifiedAt: exeMeta.modifiedAt || null,
    hostedClientVersion: hosted.version,
    robloxDemo: roblox.isDemoMode(),
    robloxProductsConfigured: claims.listProducts().filter((p) => p.configured).length,
  });
});

/**
 * Hosted External / Oxide.exe version vs live Roblox Windows client.
 * Used by the status page to show whether an external update is needed.
 */
app.get("/api/external-version", async (_req, res) => {
  try {
    const external = await externalVersion.collectExternalStatus();
    const download = externalVersion.probeHostedExe(downloadsDir, DOWNLOAD_URL);
    return res.json({
      ok: true,
      status: external.status,
      updateNeeded: external.updateNeeded,
      matched: external.matched,
      message: external.message,
      hostedClientVersion: external.hostedClientVersion,
      hostedVersionSource: external.hostedVersionSource,
      liveRobloxVersion: external.liveRobloxVersion,
      liveNumericVersion: external.liveNumericVersion,
      checkedAt: external.checkedAt,
      download: {
        available: Boolean(download.available),
        filename: download.filename,
        url: download.url,
        sizeBytes: download.sizeBytes ?? null,
        sizeLabel: download.sizeLabel || null,
        modifiedAt: download.modifiedAt || null,
      },
    });
  } catch (err) {
    console.error("[external-version]", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      message: "Could not collect external version status.",
    });
  }
});

/**
 * Aggregated public status for the gate site / Discord / ops dashboards.
 * Intentionally omits secrets, DB paths, tokens, and admin flags.
 */
app.get("/api/status", async (_req, res) => {
  const started = Date.now();
  try {
    const products = claims.listProducts();
    const configured = products.filter((p) => p.configured).length;
    const download = externalVersion.probeHostedExe(downloadsDir, DOWNLOAD_URL);
    const hosted = externalVersion.readHostedClientVersion();
    const external = await externalVersion.collectExternalStatus();

    return res.json({
      ok: true,
      service: "oxide-gate-api",
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      api: {
        ok: true,
        service: "oxide-gate-api",
        dbBackend: dbModule.dbBackend,
        dbEphemeral: Boolean(dbModule.dbEphemeral),
        downloadConfigured: Boolean(DOWNLOAD_URL),
        hostedClientVersion: hosted.version,
        robloxDemo: roblox.isDemoMode(),
        robloxProductsConfigured: configured,
      },
      download: {
        available: Boolean(download.available),
        filename: download.filename,
        url: download.url,
        sizeBytes: download.sizeBytes ?? null,
        sizeLabel: download.sizeLabel || null,
        modifiedAt: download.modifiedAt || null,
      },
      products: {
        ok: true,
        configured,
        total: products.length,
        demo: roblox.isDemoMode(),
        items: products.map((p) => ({
          plan: p.plan || p.id || null,
          name: p.name || p.plan || null,
          configured: Boolean(p.configured),
        })),
      },
      external: {
        status: external.status,
        updateNeeded: external.updateNeeded,
        matched: external.matched,
        message: external.message,
        hostedClientVersion: external.hostedClientVersion,
        liveRobloxVersion: external.liveRobloxVersion,
        liveNumericVersion: external.liveNumericVersion,
      },
    });
  } catch (err) {
    console.error("[status]", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      message: "Could not collect system status.",
    });
  }
});

/**
 * Public Roblox offset dump (from exported offsets.h). No secrets.
 */
app.get("/api/offsets", (_req, res) => {
  const payload = offsetsLib.publicOffsetsPayload();
  if (!payload.ok) {
    return res.status(503).json(payload);
  }
  return res.json(payload);
});

/**
 * List purchasable plans with Roblox catalog / gamepass buy links.
 */
app.get("/api/products", (_req, res) => {
  try {
    const products = claims.listProducts();
    return res.json({
      ok: true,
      demo: roblox.isDemoMode(),
      discordInvite: DISCORD_INVITE,
      products,
    });
  } catch (err) {
    console.error("[products]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * After buying a Shirt / T-Shirt / Gamepass on Roblox, claim an OXIDE key.
 * Body: { username, plan }
 * Verifies ownership (unless DEMO_ROBLOX=1) and stores robloxUserId+assetId so
 * one purchase cannot mint infinite keys.
 */
app.post("/api/roblox/claim", async (req, res) => {
  try {
    const { username, plan } = req.body || {};
    const result = await claims.claimKey({ username, plan });
    if (!result.ok) {
      const status =
        result.error === "not_owned"
          ? 403
          : result.error === "user_not_found" || result.error === "missing_username" || result.error === "missing_plan"
            ? 400
            : result.error === "product_not_configured"
              ? 503
              : 400;
      return res.status(status).json(result);
    }
    await dbModule.flushToPostgres().catch(() => {});
    return res.json(result);
  } catch (err) {
    console.error("[roblox/claim]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * Website redeem — activates unused key, returns download + token.
 * Body: { key, hwid? }
 */
app.post("/api/redeem", async (req, res) => {
  try {
    const { key, hwid } = req.body || {};
    const result = keys.redeem({ key, hwid: hwid || null });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    if (!result.downloadUrl) result.downloadUrl = DOWNLOAD_URL;
    else result.downloadUrl = safeDownloadUrl(result.downloadUrl) || DOWNLOAD_URL;
    await dbModule.flushToPostgres().catch(() => {});
    return res.json(result);
  } catch (err) {
    console.error("[redeem]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * EXE validate on launch — reject wrong HWID / expired / banned.
 * Body: { key, hwid, token? }
 * Unused keys are activated + bound on first successful EXE call (same machine redeem).
 */
app.post("/api/validate", async (req, res) => {
  try {
    const { key, hwid, token } = req.body || {};
    const result = keys.validateOrActivate({ key, hwid, token });
    if (!result.ok) {
      const status = result.error === "hwid_mismatch" || result.error === "banned" ? 403 : 400;
      return res.status(status).json(result);
    }
    await dbModule.flushToPostgres().catch(() => {});
    return res.json(result);
  } catch (err) {
    console.error("[validate]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * Admin: create OXIDE-XXXX keys.
 * Header: X-Admin-Secret or Authorization: Bearer <secret>
 * Body: { plan, count, days }
 */
app.post("/api/admin/create-keys", async (req, res) => {
  const secret =
    req.get("X-Admin-Secret") ||
    (req.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    (req.body && req.body.adminSecret);

  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Invalid admin secret." });
  }

  try {
    const { plan, count, days } = req.body || {};
    const result = keys.createKeys({ plan, count, days });
    await dbModule.flushToPostgres().catch(() => {});
    return res.json({
      ok: true,
      count: result.keys.length,
      days: result.days,
      plan: plan || "premium",
      keys: result.keys.map((k) => k.key),
      details: result.keys,
    });
  } catch (err) {
    console.error("[create-keys]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * Admin: revoke (ban) a key.
 * Header: X-Admin-Secret
 * Body: { key }
 */
app.post("/api/admin/revoke-key", async (req, res) => {
  const secret =
    req.get("X-Admin-Secret") ||
    (req.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    (req.body && req.body.adminSecret);

  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Invalid admin secret." });
  }

  try {
    const result = keys.revokeKey({ key: req.body?.key });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    await dbModule.flushToPostgres().catch(() => {});
    return res.json(result);
  } catch (err) {
    console.error("[revoke-key]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * Admin: clear HWID binding on a key.
 * Header: X-Admin-Secret
 * Body: { key }
 */
app.post("/api/admin/reset-hwid", async (req, res) => {
  const secret =
    req.get("X-Admin-Secret") ||
    (req.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    (req.body && req.body.adminSecret);

  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Invalid admin secret." });
  }

  try {
    const result = keys.resetHwid({ key: req.body?.key });
    if (!result.ok) {
      const status = result.error === "banned" ? 403 : 400;
      return res.status(status).json(result);
    }
    await dbModule.flushToPostgres().catch(() => {});
    return res.json(result);
  } catch (err) {
    console.error("[reset-hwid]", err);
    return res.status(500).json({ ok: false, error: "server_error", message: "Server error." });
  }
});

/**
 * Stub: SellApp (or similar) webhook — future auto-insert of keys after checkout.
 * Does not process payments yet; returns 501 with instructions.
 */
app.post("/api/webhooks/sellapp", (req, res) => {
  console.log("[sellapp webhook stub]", JSON.stringify(req.body || {}).slice(0, 500));
  res.status(501).json({
    ok: false,
    error: "not_implemented",
    message:
      "SellApp webhook stub. Wire this to verify the webhook signature, map product → plan/days, then call createKeys and email/deliver the key.",
  });
});

/** Direct Oxide.exe download — never point buyers at the GitHub source repo. */
app.get(["/downloads/Oxide.exe", "/download/Oxide.exe", "/Oxide.exe"], (req, res) => {
  const file = path.join(downloadsDir, "Oxide.exe");
  res.download(file, "Oxide.exe", (err) => {
    if (err && !res.headersSent) {
      console.error("[download]", err.message);
      res.status(404).json({ ok: false, error: "missing_exe", message: "Oxide.exe is not on this server yet." });
    }
  });
});
app.use(
  "/downloads",
  express.static(downloadsDir, {
    fallthrough: true,
    setHeaders(res, filePath) {
      if (/\.exe$/i.test(filePath)) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", 'attachment; filename="Oxide.exe"');
      }
    },
  })
);

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", message: `No route ${req.method} ${req.path}` });
});

function startKeepAlivePings() {
  const peers = [
    process.env.KEEP_ALIVE_URL,
    process.env.DISCORD_BOT_HEALTH_URL,
    "https://oxide-discord-bot-fra.onrender.com/",
  ]
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  if (!peers.length) return;
  const ping = async () => {
    for (const url of peers) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 25000);
        await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "OXIDE-KeepAlive/1.0" },
          signal: ac.signal,
        });
        clearTimeout(t);
      } catch (err) {
        console.warn(`[keep-alive] ${url}: ${err.message}`);
      }
    }
  };
  // Stagger first ping so boot is not delayed; then every ~8 minutes.
  setTimeout(ping, 45000);
  const timer = setInterval(ping, 8 * 60 * 1000);
  if (timer.unref) timer.unref();
  console.log(`  Keep-alive peers: ${peers.join(", ")}`);
}

async function main() {
  await dbModule.initDb();
  if (typeof keys.repairLifetimeKeys === "function") {
    keys.repairLifetimeKeys();
  }
  const seeded = keys.seedDemoKeys();
  // Ensure demo seed (and any boot writes) hit Postgres blob before traffic.
  if (typeof dbModule.flushToPostgres === "function") {
    await dbModule.flushToPostgres().catch(() => {});
  }

  app.listen(PORT, () => {
    console.log(`OXIDE gate-api listening on http://127.0.0.1:${PORT}`);
    console.log(`  DB: ${dbModule.dbPath} (${dbModule.dbBackend}, ephemeral=${dbModule.dbEphemeral})`);
    console.log(`  DOWNLOAD_URL: ${DOWNLOAD_URL || "(not set)"}`);
    console.log(`  Demo keys ready: ${seeded.join(", ")}`);
    console.log(`  Roblox demo mode: ${roblox.isDemoMode() ? "ON" : "off"}`);
    console.log(
      `  Roblox products: ${claims
        .listProducts()
        .filter((p) => p.configured)
        .map((p) => `${p.plan}=${p.assetId}`)
        .join(", ") || "(none configured)"}`
    );
    console.log(`  Admin: POST /api/admin/create-keys with X-Admin-Secret`);
    startKeepAlivePings();
  });
}

main().catch((err) => {
  console.error("[boot] failed:", err);
  process.exit(1);
});
