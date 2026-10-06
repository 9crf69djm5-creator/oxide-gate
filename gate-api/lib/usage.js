"use strict";

/**
 * Unique Oxide users. One row per Roblox person, with first-seen and last-seen.
 * Public reads never include license keys, tokens, or machine ids.
 */

const dbModule = require("./db");
const keys = require("./keys");

const MIN_UPDATE_MS = 60 * 1000;
const MAX_PEOPLE = 500;
const MAX_IDS_PER_KEY = 3;
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX_HITS = 30;

const ipHits = new Map();

function db() {
  return dbModule.db;
}

function ensureTables() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS usage_people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_last_seen ON usage_people(last_seen);

    CREATE TABLE IF NOT EXISTS usage_sources (
      key TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      seen_ids TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function cleanLabel(raw) {
  const t = String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[`<>]/g, "")
    .trim()
    .slice(0, 32);
  if (!t || /^unknown$/i.test(t)) return "";
  return t;
}

function cleanUsername(raw) {
  const t = cleanLabel(raw);
  if (!/^[A-Za-z0-9_]{2,32}$/.test(t)) return "";
  return t;
}

function parseUserId(value) {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isSafeInteger(n) || n <= 0) return 0;
  return n;
}

function clientIp(req) {
  const forwarded = String(req.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  return forwarded || req.ip || "unknown";
}

function rateLimitIp(ip) {
  const now = Date.now();
  const prev = ipHits.get(ip) || [];
  const recent = prev.filter((t) => now - t < IP_WINDOW_MS);
  if (recent.length >= IP_MAX_HITS) {
    ipHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  if (ipHits.size > 5000) {
    for (const [k, hits] of ipHits) {
      if (!hits.some((t) => now - t < IP_WINDOW_MS)) ipHits.delete(k);
    }
  }
  return true;
}

function summary() {
  ensureTables();
  const row = db()
    .prepare("SELECT COUNT(*) AS n, MAX(last_seen) AS last_seen FROM usage_people")
    .get();
  return {
    count: Number(row?.n) || 0,
    lastActivity: row?.last_seen || null,
    updatedAt: new Date().toISOString(),
  };
}

function publicBoard() {
  ensureTables();
  const people = db()
    .prepare(
      `SELECT name, username, first_seen, last_seen
       FROM usage_people
       ORDER BY last_seen DESC
       LIMIT ?`
    )
    .all(MAX_PEOPLE);
  return {
    ok: true,
    ...summary(),
    people: people.map((p) => ({
      name: p.name,
      username: p.username || null,
      firstSeen: p.first_seen,
      lastSeen: p.last_seen,
    })),
  };
}

function seenList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Authenticated, rate-limited check-in from the Oxide client.
 * @param {import("express").Request} req
 */
function ingest(req) {
  ensureTables();
  const ip = clientIp(req);
  if (!rateLimitIp(ip)) {
    return {
      status: 429,
      body: { ok: false, error: "rate_limited", message: "Too many check-ins. Try again shortly." },
    };
  }

  const body = req.body || {};
  const auth = keys.sessionOk({ key: body.key, token: body.token });
  if (!auth.ok) {
    const status = auth.error === "banned" || auth.error === "bad_token" ? 403 : 400;
    return {
      status,
      body: { ok: false, error: auth.error, message: auth.message },
    };
  }

  const userId = parseUserId(body.userId);
  const username = cleanUsername(body.username);
  const label = cleanLabel(body.displayName) || username;
  if (!userId && !username) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "missing_identity",
        message: "Need a Roblox username or user id.",
      },
    };
  }

  const personId = userId ? `rbx:${userId}` : `name:${username.toLowerCase()}`;
  const now = new Date().toISOString();
  const source = db().prepare("SELECT person_id, seen_ids FROM usage_sources WHERE key = ?").get(auth.key);
  const seen = source ? seenList(source.seen_ids) : [];
  if (source && !seen.includes(personId) && seen.length >= MAX_IDS_PER_KEY) {
    return { status: 200, body: { ok: true, recorded: false, ...summary() } };
  }

  const existing = db()
    .prepare("SELECT name, username, last_seen FROM usage_people WHERE id = ?")
    .get(personId);
  const nextName = label || existing?.name || username || "Player";
  const nextUser = username || existing?.username || null;
  const last = existing ? Date.parse(existing.last_seen) : NaN;
  const fresh = Number.isFinite(last) && Date.now() - last < MIN_UPDATE_MS;
  const unchanged = existing && existing.name === nextName && (existing.username || null) === nextUser;
  if (fresh && unchanged && seen.includes(personId)) {
    return { status: 200, body: { ok: true, recorded: false, ...summary() } };
  }

  if (!source) {
    db()
      .prepare(
        "INSERT INTO usage_sources (key, person_id, seen_ids, updated_at) VALUES (?, ?, ?, ?)"
      )
      .run(auth.key, personId, personId, now);
  } else if (!seen.includes(personId)) {
    seen.push(personId);
    db()
      .prepare("UPDATE usage_sources SET person_id = ?, seen_ids = ?, updated_at = ? WHERE key = ?")
      .run(personId, seen.join(","), now, auth.key);
  }

  if (existing) {
    db()
      .prepare("UPDATE usage_people SET name = ?, username = ?, last_seen = ? WHERE id = ?")
      .run(nextName, nextUser, now, personId);
  } else {
    db()
      .prepare(
        "INSERT INTO usage_people (id, name, username, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
      )
      .run(personId, nextName, nextUser, now, now);
  }

  return { status: 200, body: { ok: true, recorded: true, ...summary() } };
}

module.exports = {
  ensureTables,
  summary,
  publicBoard,
  ingest,
};
