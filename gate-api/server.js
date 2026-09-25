const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const { dbPath } = require("./lib/db");
const keys = require("./lib/keys");
const claims = require("./lib/claims");
const roblox = require("./lib/roblox");

const PORT = Number(process.env.PORT) || 8787;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "change-me-to-a-long-random-string";
const SITE_EXE_URL = "https://oxide-gate-site.vercel.app/downloads/Oxide.exe";
const DOWNLOAD_URL = safeDownloadUrl(process.env.DOWNLOAD_URL) || SITE_EXE_URL;
const DISCORD_INVITE = process.env.DISCORD_INVITE || "https://discord.gg/3PXJ8r56T";

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "oxide-gate-api",
    db: dbPath,
    downloadConfigured: Boolean(DOWNLOAD_URL),
    robloxDemo: roblox.isDemoMode(),
    robloxProductsConfigured: claims.listProducts().filter((p) => p.configured).length,
  });
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
app.post("/api/redeem", (req, res) => {
  try {
    const { key, hwid } = req.body || {};
    const result = keys.redeem({ key, hwid: hwid || null });
    if (!result.ok) {
      return res.status(400).json(result);
    }
    if (!result.downloadUrl) result.downloadUrl = DOWNLOAD_URL;
    else result.downloadUrl = safeDownloadUrl(result.downloadUrl) || DOWNLOAD_URL;
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
app.post("/api/validate", (req, res) => {
  try {
    const { key, hwid, token } = req.body || {};
    const result = keys.validateOrActivate({ key, hwid, token });
    if (!result.ok) {
      const status = result.error === "hwid_mismatch" || result.error === "banned" ? 403 : 400;
      return res.status(status).json(result);
    }
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
app.post("/api/admin/create-keys", (req, res) => {
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

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", message: `No route ${req.method} ${req.path}` });
});

// Seed demo keys on every boot (INSERT OR IGNORE)
const seeded = keys.seedDemoKeys();

app.listen(PORT, () => {
  console.log(`OXIDE gate-api listening on http://127.0.0.1:${PORT}`);
  console.log(`  DB: ${dbPath}`);
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
});
