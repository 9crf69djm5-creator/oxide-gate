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
const DISCORD_BOT_HEALTH_URL = (
  process.env.DISCORD_BOT_HEALTH_URL || "https://oxide-discord-bot-fra.onrender.com/"
).replace(/\/?$/, "/");
const downloadsDir = path.join(__dirname, "public", "downloads");

/** Server-side Discord bot health probe (avoids browser CORS on the bot host). */
async function probeDiscordBotHealth() {
  const started = Date.now();
  try {
    const res = await fetch(DISCORD_BOT_HEALTH_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OXIDE-GateAPI-Status/1.0",
      },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    const ready = body?.ready === true;
    const ok =
      res.ok &&
      (ready || body?.ok === true || body?.service === "oxide-discord-bot");
    return {
      ok,
      ready: ready || (ok && body?.ready !== false),
      user: body?.user || null,
      service: body?.service || null,
      status: res.status,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      ready: false,
      user: null,
      service: null,
      status: 0,
      latencyMs: Date.now() - started,
      error: err?.message || "unreachable",
    };
  }
}

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
// Dumper uploads can be ~100KB–1MB of JSON.
app.use(express.json({ limit: "2mb" }));

app.use(
  cors({
    origin(origin, cb) {
      // Public offsets API: allow any origin (theo-style open dump).
      // Other routes still permit configured gate-site / localhost.
      if (!origin || origin === "null" || corsOrigins.includes(origin) || corsOrigins.includes("*")) {
        return cb(null, true);
      }
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return cb(null, true);
      }
      // Allow vercel / oxide production frontends by default
      if (/^https:\/\/([a-z0-9-]+\.)?(oxide-gate-site\.vercel\.app|vercel\.app)$/i.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Secret"],
  })
);

/** Open CORS for public offset downloads (developers embedding the API). */
function publicOffsetsCors(_req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  return next();
}

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
    const [external, bot] = await Promise.all([
      externalVersion.collectExternalStatus(),
      probeDiscordBotHealth(),
    ]);

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
      bot,
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
 * Public Roblox offset dump (live dumper upload or exported headers). No secrets.
 * Open CORS — developers may fetch from any origin (theo-style public dump).
 */
app.options(["/api/offsets", "/api/offsets/raw", "/api/offsets/hex", "/api/offsets.hpp", "/api/offsets.cs", "/api/offsets.txt", "/offsets.json", "/offsets.hpp", "/offsets.cs", "/offsets.txt"], publicOffsetsCors);

app.get("/api/offsets", publicOffsetsCors, (_req, res) => {
  const payload = offsetsLib.publicOffsetsPayload();
  if (!payload.ok) {
    return res.status(503).json(payload);
  }
  return res.json(payload);
});

/** Decimal-only map (theo Offsets.json shape). */
app.get(["/api/offsets/raw", "/offsets.json"], publicOffsetsCors, (_req, res) => {
  const payload = offsetsLib.rawOffsetsPayload();
  if (!payload) {
    return res.status(503).json({
      ok: false,
      error: "missing_offsets",
      message: "Offsets dump not found.",
    });
  }
  res.setHeader("Content-Disposition", 'inline; filename="offsets.json"');
  return res.json(payload);
});

/** Hex-string map. */
app.get("/api/offsets/hex", publicOffsetsCors, (_req, res) => {
  const payload = offsetsLib.hexOffsetsPayload();
  if (!payload) {
    return res.status(503).json({ ok: false, error: "missing_offsets" });
  }
  return res.json(payload);
});

app.get(["/api/offsets.hpp", "/offsets.hpp"], publicOffsetsCors, (_req, res) => {
  const body = offsetsLib.offsetsHpp();
  if (!body) return res.status(503).type("text/plain").send("Offsets dump not found.");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="offsets.hpp"');
  return res.send(body);
});

app.get(["/api/offsets.cs", "/offsets.cs"], publicOffsetsCors, (_req, res) => {
  const body = offsetsLib.offsetsCs();
  if (!body) return res.status(503).type("text/plain").send("Offsets dump not found.");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="offsets.cs"');
  return res.send(body);
});

app.get(["/api/offsets.txt", "/offsets.txt"], publicOffsetsCors, (_req, res) => {
  const body = offsetsLib.offsetsTxt();
  if (!body) return res.status(503).type("text/plain").send("Offsets dump not found.");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="offsets.txt"');
  return res.send(body);
});

/**
 * Admin: upload a fresh Roblox offset dump from the OXIDE dumper.
 * Header: X-Admin-Secret (or Authorization: Bearer / body.adminSecret)
 * Body: jonah dumper JSON ({ metadata, offsets }) or OXIDE namespaces shape.
 */
app.post("/api/admin/offsets", (req, res) => {
  const secret =
    req.get("X-Admin-Secret") ||
    (req.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    (req.body && req.body.adminSecret);
  if (!secret || secret !== ADMIN_SECRET) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      message: "Invalid admin secret.",
    });
  }

  try {
    const body = { ...(req.body || {}) };
    delete body.adminSecret;
    const normalized = offsetsLib.normalizeDumperPayload(body);
    if (!normalized.ok) {
      return res.status(400).json(normalized);
    }
    const saved = offsetsLib.saveOffsetsDump(normalized);
    if (!saved.ok) {
      return res.status(500).json(saved);
    }
    console.log(
      `[offsets] uploaded ${saved.totalOffsets} fields for ${saved.robloxVersion || "unknown"}`
    );
    return res.json({
      ok: true,
      message: "Offsets updated.",
      robloxVersion: saved.robloxVersion,
      totalOffsets: saved.totalOffsets,
      generatedAt: saved.generatedAt,
      publicUrl: "/api/offsets",
      downloads: {
        json: "/api/offsets",
        raw: "/api/offsets/raw",
        hex: "/api/offsets/hex",
        hpp: "/api/offsets.hpp",
        cs: "/api/offsets.cs",
        txt: "/api/offsets.txt",
      },
    });
  } catch (err) {
    console.error("[admin/offsets]", err);
    return res.status(500).json({
      ok: false,
      error: "server_error",
      message: "Could not save offsets dump.",
    });
  }
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
  // Demo keys only when explicitly enabled (local/staging). Production uses
  // Roblox claim or POST /api/admin/create-keys — never auto-seed OXIDE-DEMO-*.
  const seedDemos =
    String(process.env.SEED_DEMO_KEYS || "").toLowerCase() === "1" ||
    String(process.env.SEED_DEMO_KEYS || "").toLowerCase() === "true" ||
    roblox.isDemoMode();
  const seeded = seedDemos ? keys.seedDemoKeys() : [];
  // Ensure boot writes hit Postgres blob before traffic.
  if (typeof dbModule.flushToPostgres === "function") {
    await dbModule.flushToPostgres().catch(() => {});
  }

  app.listen(PORT, () => {
    console.log(`OXIDE gate-api listening on http://127.0.0.1:${PORT}`);
    console.log(`  DB: ${dbModule.dbPath} (${dbModule.dbBackend}, ephemeral=${dbModule.dbEphemeral})`);
    console.log(`  DOWNLOAD_URL: ${DOWNLOAD_URL || "(not set)"}`);
    if (seeded.length) {
      console.log(`  Demo keys ready: ${seeded.join(", ")}`);
    }
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
