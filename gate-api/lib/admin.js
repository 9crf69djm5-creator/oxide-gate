"use strict";

/**
 * Owner admin sessions for the gate site.
 *
 * Flow: the Discord guild owner runs /admin-login → bot (holding ADMIN_SECRET)
 * asks POST /api/admin/session/issue for a one-time code → owner opens
 * SITE/admin#code=… → site (same-origin via the Vercel /api/admin proxy)
 * trades it at /api/admin/session/exchange for an HttpOnly, SameSite=Strict
 * session cookie. ADMIN_SECRET and the session token never reach page JS.
 * Codes and tokens are stored as SHA-256 hashes only.
 */
const crypto = require("crypto");
const dbModule = require("./db");
const keys = require("./keys");

const CODE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const PLACEHOLDER_SECRET = "change-me-to-a-long-random-string";
const COOKIE_NAME = "oxide_admin";
const COOKIE_PATH = "/api/admin";
const CSRF_HEADER = "X-Oxide-Admin";

function getDb() {
  return dbModule.db;
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (!ba.length || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function adminSecret() {
  return String(process.env.ADMIN_SECRET || "").trim();
}

/** The repo placeholder is public, so it must never authorize anything on Render. */
function secretUsable() {
  const s = adminSecret();
  if (!s) return false;
  if (s === PLACEHOLDER_SECRET && process.env.RENDER) return false;
  return true;
}

function secretMatches(candidate) {
  return secretUsable() && safeEqual(candidate, adminSecret());
}

/** Optional hard allow-list on the API side (comma-separated Discord ids). */
function ownerAllowList() {
  return String(process.env.OWNER_DISCORD_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{5,32}$/.test(s));
}

function ensureTables() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS admin_login_codes (
      code_hash TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      discord_user_id TEXT NOT NULL,
      discord_username TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS discord_profiles (
      discord_user_id TEXT PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      key TEXT,
      detail TEXT
    );
  `);
  try {
    getDb().exec("ALTER TABLE keys ADD COLUMN last_seen_at TEXT");
  } catch (_) {
    /* already exists */
  }
}

function pruneExpired() {
  const now = nowIso();
  getDb().prepare("DELETE FROM admin_login_codes WHERE expires_at < ?").run(now);
  getDb().prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(now);
}

function issueLoginCode({ discordUserId, discordUsername }) {
  const id = keys.normalizeDiscordUserId(discordUserId);
  if (!id) return { ok: false, error: "invalid_discord", message: "Invalid Discord user id." };
  const allow = ownerAllowList();
  if (allow.length && !allow.includes(id)) {
    return { ok: false, error: "not_owner", message: "This Discord account is not an OXIDE owner." };
  }
  pruneExpired();
  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const username = String(discordUsername || "").trim().slice(0, 64) || null;
  getDb()
    .prepare(
      `INSERT INTO admin_login_codes (code_hash, discord_user_id, discord_username, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(sha256(code), id, username, nowIso(), expiresAt);
  if (username) rememberProfiles({ [id]: { username } });
  audit(id, "login_code_issued", null, username);
  return { ok: true, code, expiresAt };
}

function exchangeLoginCode(code) {
  const raw = String(code || "").trim();
  if (!raw || raw.length > 128) {
    return { ok: false, error: "invalid_code", message: "Login link is invalid or expired." };
  }
  const hash = sha256(raw);
  const row = getDb().prepare("SELECT * FROM admin_login_codes WHERE code_hash = ?").get(hash);
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, error: "invalid_code", message: "Login link is invalid or expired." };
  }
  const allow = ownerAllowList();
  if (allow.length && !allow.includes(row.discord_user_id)) {
    return { ok: false, error: "not_owner", message: "This Discord account is not an OXIDE owner." };
  }
  const claimed = getDb()
    .prepare("UPDATE admin_login_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL")
    .run(nowIso(), hash);
  if (!claimed.changes) {
    return { ok: false, error: "invalid_code", message: "Login link is invalid or expired." };
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getDb()
    .prepare(
      `INSERT INTO admin_sessions (token_hash, discord_user_id, discord_username, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(sha256(token), row.discord_user_id, row.discord_username, nowIso(), expiresAt);
  audit(row.discord_user_id, "session_started", null, row.discord_username);
  return {
    ok: true,
    token,
    expiresAt,
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
  };
}

function getSession(token) {
  const raw = String(token || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(raw)) return null;
  const row = getDb().prepare("SELECT * FROM admin_sessions WHERE token_hash = ?").get(sha256(raw));
  if (!row || Date.parse(row.expires_at) < Date.now()) return null;
  const allow = ownerAllowList();
  if (allow.length && !allow.includes(row.discord_user_id)) return null;
  return row;
}

function endSession(token) {
  const raw = String(token || "").trim();
  if (!raw) return;
  getDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(raw));
}

function bearer(req) {
  return (req.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function readCookie(req, name) {
  const header = String(req.get("Cookie") || "");
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

function cookieAttrs(req) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(req.get("Host") || ""));
  return `Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict${local ? "" : "; Secure"}`;
}

function setSessionCookie(req, res, token) {
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; ${cookieAttrs(req)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSessionCookie(req, res) {
  res.append("Set-Cookie", `${COOKIE_NAME}=; ${cookieAttrs(req)}; Max-Age=0`);
}

function allowedOrigins() {
  const site = String(process.env.SITE_URL || "https://oxide-gate-site.vercel.app").replace(/\/$/, "");
  return new Set([
    site,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ]);
}

/**
 * Cookie-authenticated writes must come from the site itself: a custom header
 * (cross-site forms cannot set it) and, when present, a matching Origin.
 */
function csrfOk(req) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  if (req.get(CSRF_HEADER) !== "1") return false;
  const origin = req.get("Origin");
  if (origin && !allowedOrigins().has(origin.replace(/\/$/, ""))) return false;
  return true;
}

/**
 * Express middleware. Accepts the owner session cookie (site) or ADMIN_SECRET
 * via X-Admin-Secret / Bearer (bot / CLI). Sessions are re-read from the DB on
 * every request. Sets req.admin = { kind, actor, ... }.
 */
function requireAdmin({ sessionOnly = false, secretOnly = false } = {}) {
  return (req, res, next) => {
    const headerSecret = req.get("X-Admin-Secret") || "";
    if (!sessionOnly && (secretMatches(headerSecret) || secretMatches(bearer(req)))) {
      req.admin = { kind: "secret", actor: "admin-secret" };
      return next();
    }
    if (!secretOnly) {
      const token = readCookie(req, COOKIE_NAME);
      const session = getSession(token);
      if (session && !csrfOk(req)) {
        return res.status(403).json({ ok: false, error: "bad_origin", message: "Request blocked." });
      }
      if (session) {
        req.admin = {
          kind: "session",
          actor: session.discord_user_id,
          token,
          discordUserId: session.discord_user_id,
          discordUsername: session.discord_username,
          expiresAt: session.expires_at,
        };
        return next();
      }
    }
    return notFound(req, res);
  };
}

/** Same body as the server's catch-all 404 so non-owners learn nothing. */
function notFound(req, res) {
  return res.status(404).json({ ok: false, error: "not_found", message: `No route ${req.method} ${req.path}` });
}

function rememberProfiles(map) {
  const stmt = getDb().prepare(
    `INSERT INTO discord_profiles (discord_user_id, username, display_name, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(discord_user_id) DO UPDATE SET
       username = COALESCE(excluded.username, discord_profiles.username),
       display_name = COALESCE(excluded.display_name, discord_profiles.display_name),
       updated_at = excluded.updated_at`
  );
  const at = nowIso();
  for (const [id, p] of Object.entries(map || {})) {
    if (!keys.normalizeDiscordUserId(id) || !p) continue;
    stmt.run(id, p.username || null, p.displayName || p.globalName || null, at);
  }
}

function profileMap() {
  const rows = getDb().prepare("SELECT * FROM discord_profiles").all();
  const out = {};
  for (const r of rows) out[r.discord_user_id] = r;
  return out;
}

/** Ask the Discord bot to resolve usernames for ids we have not cached yet. */
async function refreshProfiles(ids) {
  const missing = ids.filter(Boolean);
  if (!missing.length || !secretUsable()) return;
  const base = String(
    process.env.DISCORD_BOT_NOTIFY_URL ||
      process.env.DISCORD_BOT_HEALTH_URL ||
      "https://oxide-discord-bot-fra.onrender.com"
  )
    .trim()
    .replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/internal/resolve-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Admin-Secret": adminSecret(),
        "User-Agent": "OXIDE-GateAPI/1.0",
      },
      body: JSON.stringify({ ids: missing.slice(0, 200) }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok && body.users) rememberProfiles(body.users);
  } catch (err) {
    console.warn("[admin] profile refresh skipped:", err.message);
  }
}

function audit(actor, action, key, detail) {
  try {
    getDb()
      .prepare("INSERT INTO admin_audit (at, actor, action, key, detail) VALUES (?, ?, ?, ?, ?)")
      .run(nowIso(), String(actor || "unknown"), action, key || null, detail ? String(detail).slice(0, 300) : null);
  } catch (err) {
    console.warn("[admin] audit write failed:", err.message);
  }
}

function recentAudit(limit = 30) {
  return getDb()
    .prepare("SELECT at, actor, action, key, detail FROM admin_audit ORDER BY id DESC LIMIT ?")
    .all(limit);
}

function touchLastSeen(rawKey) {
  const key = keys.normalizeKey(rawKey);
  if (!key) return;
  getDb().prepare("UPDATE keys SET last_seen_at = ? WHERE key = ?").run(nowIso(), key);
}

/** Every key with every bind the DB stores, for the owner dashboard. */
async function listAllKeys({ resolveNames = true } = {}) {
  const rows = getDb()
    .prepare("SELECT * FROM keys ORDER BY COALESCE(activated_at, created_at) DESC")
    .all();
  const claimRows = getDb()
    .prepare(
      `SELECT key, asset_id, asset_type, plan, roblox_user_id, roblox_username, claimed_at
       FROM roblox_claims ORDER BY claimed_at ASC`
    )
    .all();
  const claimsByKey = {};
  for (const c of claimRows) (claimsByKey[c.key] ||= []).push(c);
  const links = getDb().prepare("SELECT * FROM discord_roblox_links").all();
  const linkByDiscord = {};
  for (const l of links) linkByDiscord[l.discord_user_id] = l;

  let profiles = profileMap();
  if (resolveNames) {
    const unknown = [...new Set(rows.map((r) => r.discord_user_id).filter(Boolean))].filter(
      (id) => !profiles[id]?.username
    );
    if (unknown.length) {
      await refreshProfiles(unknown);
      profiles = profileMap();
    }
  }

  return rows.map((row) => {
    const lic = keys.formatLicense(row, { includeFullKey: true });
    const claims = (claimsByKey[row.key] || []).map((c) => ({
      assetId: c.asset_id,
      assetType: c.asset_type,
      plan: c.plan,
      robloxUserId: c.roblox_user_id,
      robloxUsername: c.roblox_username || null,
      claimedAt: c.claimed_at,
    }));
    const link = row.discord_user_id ? linkByDiscord[row.discord_user_id] : null;
    const prof = row.discord_user_id ? profiles[row.discord_user_id] : null;
    return {
      key: row.key,
      keyMasked: lic.keyMasked,
      status: lic.status,
      rawStatus: row.status,
      plan: lic.plan,
      planId: lic.planId,
      durationDays: row.duration_days ?? null,
      createdAt: row.created_at || null,
      activatedAt: row.activated_at || null,
      expiresAt: row.expires_at || null,
      remainingLabel: lic.remainingLabel,
      daysRemaining: lic.daysRemaining,
      hwid: row.hwid || null,
      hasSessionToken: Boolean(row.token),
      lastSeenAt: row.last_seen_at || null,
      discordUserId: row.discord_user_id || null,
      discordUsername: prof?.username || null,
      discordDisplayName: prof?.display_name || null,
      robloxUserId: row.roblox_user_id || null,
      robloxUsername: row.roblox_username || null,
      discordRobloxLink: link
        ? { robloxUserId: link.roblox_user_id, robloxUsername: link.roblox_username, linkedAt: link.linked_at }
        : null,
      source: claims.length ? "roblox_claim" : "manual",
      claim: claims[0] || null,
      claims,
    };
  });
}

module.exports = {
  ensureTables,
  secretMatches,
  secretUsable,
  issueLoginCode,
  exchangeLoginCode,
  getSession,
  endSession,
  requireAdmin,
  notFound,
  setSessionCookie,
  clearSessionCookie,
  csrfOk,
  rememberProfiles,
  audit,
  recentAudit,
  touchLastSeen,
  listAllKeys,
  ownerAllowList,
};
