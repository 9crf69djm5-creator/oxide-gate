"use strict";

/**
 * Unique Oxide users. One row per Roblox person, with first-seen and last-seen.
 * Public reads never include license keys, tokens, or machine ids.
 *
 * The same person used to become two rows when one launch sent a Roblox user id
 * (stored as rbx:<id>) and another sent only the username (stored as name:<username>).
 * Display name is a label. Match on user id or username, case-insensitive, and
 * keep a single row.
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
  const merged = mergeStoredDuplicates();
  if (merged > 0) {
    console.log(`[usage] merged ${merged} duplicate leaderboard ${merged === 1 ? "person" : "people"}`);
  }
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

function userIdFromId(id) {
  const m = /^rbx:(\d+)$/.exec(String(id || ""));
  if (!m) return 0;
  return parseUserId(m[1]);
}

/** Username identity for a stored row: column, or the name:<username> key. */
function usernameOf(row) {
  const fromCol = cleanUsername(row && row.username);
  if (fromCol) return fromCol.toLowerCase();
  const id = String((row && row.id) || "");
  if (id.startsWith("name:")) {
    const fromId = cleanUsername(id.slice(5));
    if (fromId) return fromId.toLowerCase();
  }
  return "";
}

function timeMs(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

function earliest(isos) {
  let best = "";
  let bestMs = Infinity;
  for (const iso of isos) {
    const t = timeMs(iso);
    if (!Number.isFinite(t) || t >= bestMs) continue;
    bestMs = t;
    best = iso;
  }
  return best;
}

function latest(isos) {
  let best = "";
  let bestMs = -Infinity;
  for (const iso of isos) {
    const t = timeMs(iso);
    if (!Number.isFinite(t) || t <= bestMs) continue;
    bestMs = t;
    best = iso;
  }
  return best;
}

function labelFromLatest(rows) {
  const sorted = [...rows].sort((a, b) => (timeMs(b.last_seen) || 0) - (timeMs(a.last_seen) || 0));
  for (const row of sorted) {
    const name = cleanLabel(row.name);
    if (name) return name;
  }
  return "";
}

function usernameFromLatest(rows) {
  const sorted = [...rows].sort((a, b) => (timeMs(b.last_seen) || 0) - (timeMs(a.last_seen) || 0));
  for (const row of sorted) {
    const username = cleanUsername(row.username);
    if (username) return username;
  }
  for (const row of sorted) {
    const id = String(row.id || "");
    if (!id.startsWith("name:")) continue;
    const username = cleanUsername(id.slice(5));
    if (username) return username;
  }
  return "";
}

/**
 * Prefer a Roblox user id already stored on this person so the key does not flap.
 * A username-only row is upgraded when this check-in includes a user id.
 */
function canonicalId(userId, username, matches) {
  const storedIds = [...new Set(matches.map((row) => userIdFromId(row.id)).filter(Boolean))];
  if (userId && (storedIds.length === 0 || storedIds.includes(userId))) return `rbx:${userId}`;
  if (storedIds.length === 1) return `rbx:${storedIds[0]}`;
  if (storedIds.length > 1) return chooseCanonicalId(matches);
  const uname = (username || matches.map(usernameOf).find(Boolean) || "").toLowerCase();
  if (uname) return `name:${uname}`;
  if (userId) return `rbx:${userId}`;
  return "";
}

function chooseCanonicalId(rows) {
  const withUid = rows.filter((row) => userIdFromId(row.id) > 0);
  if (withUid.length) {
    withUid.sort((a, b) => {
      const delta = (timeMs(a.first_seen) || 0) - (timeMs(b.first_seen) || 0);
      if (delta) return delta;
      return userIdFromId(a.id) - userIdFromId(b.id);
    });
    return `rbx:${userIdFromId(withUid[0].id)}`;
  }
  const uname = rows.map(usernameOf).find(Boolean);
  if (uname) return `name:${uname}`;
  return rows[0] ? rows[0].id : "";
}

function findMatches(userId, username) {
  const rows = db()
    .prepare("SELECT id, name, username, first_seen, last_seen FROM usage_people")
    .all();
  const uname = username ? username.toLowerCase() : "";
  return rows.filter((row) => {
    if (userId && userIdFromId(row.id) === userId) return true;
    if (uname && usernameOf(row) === uname) return true;
    return false;
  });
}

function clusterRows(rows) {
  const parent = rows.map((_, i) => i);
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a, b) {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  }
  const byUid = new Map();
  const byName = new Map();
  rows.forEach((row, i) => {
    const uid = userIdFromId(row.id);
    if (uid) {
      if (byUid.has(uid)) union(i, byUid.get(uid));
      else byUid.set(uid, i);
    }
    const uname = usernameOf(row);
    if (uname) {
      if (byName.has(uname)) union(i, byName.get(uname));
      else byName.set(uname, i);
    }
  });
  const groups = new Map();
  rows.forEach((row, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(row);
  });
  return [...groups.values()];
}

function retargetSources(aliasIds, canonical, now) {
  const aliases = new Set(aliasIds);
  aliases.add(canonical);
  const sources = db().prepare("SELECT key, person_id, seen_ids FROM usage_sources").all();
  const update = db().prepare(
    "UPDATE usage_sources SET person_id = ?, seen_ids = ?, updated_at = ? WHERE key = ?"
  );
  for (const source of sources) {
    const seen = seenList(source.seen_ids);
    if (!aliases.has(source.person_id) && !seen.some((id) => aliases.has(id))) continue;
    const next = [];
    for (const id of seen) {
      const mapped = aliases.has(id) ? canonical : id;
      if (!next.includes(mapped)) next.push(mapped);
    }
    if (!next.includes(canonical) && aliases.has(source.person_id)) next.push(canonical);
    const person = aliases.has(source.person_id) ? canonical : source.person_id;
    if (person !== source.person_id || next.join(",") !== seen.join(",")) {
      update.run(person, next.join(","), now, source.key);
    }
  }
}

/**
 * Collapse every row in a group into one. Keeps the earliest first-seen and
 * the latest last-seen. Incoming check-ins pass touchLastSeen so last-seen moves.
 */
function collapseGroup(group, opts) {
  if (!group.length) return "";
  const canonical = opts.canonicalId || chooseCanonicalId(group);
  if (!canonical) return "";
  const now = opts.now || new Date().toISOString();
  const firstSeen = earliest(group.map((row) => row.first_seen)) || now;
  let lastSeen = latest(group.map((row) => row.last_seen)) || firstSeen;
  if (opts.touchLastSeen) lastSeen = latest([lastSeen, now]) || now;
  const name = cleanLabel(opts.name) || labelFromLatest(group) || usernameFromLatest(group) || "Player";
  const username = cleanUsername(opts.username) || usernameFromLatest(group) || null;
  const ids = group.map((row) => row.id);
  const update = db().prepare(
    "UPDATE usage_people SET name = ?, username = ?, first_seen = ?, last_seen = ? WHERE id = ?"
  );
  const insert = db().prepare(
    "INSERT INTO usage_people (id, name, username, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
  );
  const remove = db().prepare("DELETE FROM usage_people WHERE id = ?");
  if (ids.includes(canonical)) {
    update.run(name, username, firstSeen, lastSeen, canonical);
  } else {
    insert.run(canonical, name, username, firstSeen, lastSeen);
  }
  for (const id of ids) {
    if (id !== canonical) remove.run(id);
  }
  retargetSources(ids, canonical, now);
  return canonical;
}

/** One row per person already stored. Same user id or same username. */
function mergeStoredDuplicates() {
  const rows = db()
    .prepare("SELECT id, name, username, first_seen, last_seen FROM usage_people")
    .all();
  if (rows.length < 2) return 0;
  const groups = clusterRows(rows).filter((group) => group.length > 1);
  if (!groups.length) return 0;
  const now = new Date().toISOString();
  const run = db().transaction(() => {
    for (const group of groups) collapseGroup(group, { now, touchLastSeen: false });
  });
  run();
  return groups.length;
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

function sourceAllows(licenseKey, canonical, aliasIds) {
  const source = db().prepare("SELECT person_id, seen_ids FROM usage_sources WHERE key = ?").get(licenseKey);
  if (!source) return { ok: true, source: null };
  const aliases = new Set(aliasIds);
  aliases.add(canonical);
  const seen = seenList(source.seen_ids);
  const already = seen.some((id) => aliases.has(id)) || aliases.has(source.person_id);
  const next = [];
  for (const id of seen) {
    const mapped = aliases.has(id) ? canonical : id;
    if (!next.includes(mapped)) next.push(mapped);
  }
  if (!next.includes(canonical)) {
    if (!already && next.length >= MAX_IDS_PER_KEY) return { ok: false, source };
    next.push(canonical);
  }
  const person = aliases.has(source.person_id) ? canonical : source.person_id || canonical;
  return { ok: true, source, person, seen: next };
}

function writeSource(licenseKey, canonical, planned, now) {
  if (!planned.source) {
    db()
      .prepare(
        "INSERT INTO usage_sources (key, person_id, seen_ids, updated_at) VALUES (?, ?, ?, ?)"
      )
      .run(licenseKey, canonical, canonical, now);
    return;
  }
  const person = planned.person || canonical;
  const seen = planned.seen && planned.seen.length ? planned.seen : [canonical];
  db()
    .prepare("UPDATE usage_sources SET person_id = ?, seen_ids = ?, updated_at = ? WHERE key = ?")
    .run(person, seen.join(","), now, licenseKey);
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

  const matches = findMatches(userId, username);
  const personId = canonicalId(userId, username, matches);
  const now = new Date().toISOString();
  const existing = matches.find((row) => row.id === personId) || matches[0] || null;
  const nextName = label || (existing && cleanLabel(existing.name)) || username || "Player";
  const nextUser =
    username || (existing && (cleanUsername(existing.username) || usernameFromLatest([existing]))) || null;
  const sameRow = matches.length === 1 && matches[0].id === personId;
  const last = sameRow ? timeMs(matches[0].last_seen) : NaN;
  const fresh = Number.isFinite(last) && Date.now() - last < MIN_UPDATE_MS;
  const unchanged =
    sameRow && matches[0].name === nextName && (cleanUsername(matches[0].username) || null) === (nextUser || null);
  const aliasIds = matches.map((row) => row.id);
  const planned = sourceAllows(auth.key, personId, aliasIds);
  const seen = planned.source ? seenList(planned.source.seen_ids) : [];
  if (fresh && unchanged && seen.includes(personId)) {
    return { status: 200, body: { ok: true, recorded: false, ...summary() } };
  }
  if (!planned.ok) {
    return { status: 200, body: { ok: true, recorded: false, ...summary() } };
  }

  const run = db().transaction(() => {
    if (!matches.length) {
      db()
        .prepare(
          "INSERT INTO usage_people (id, name, username, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)"
        )
        .run(personId, nextName, nextUser, now, now);
    } else {
      collapseGroup(matches, {
        canonicalId: personId,
        name: nextName,
        username: nextUser,
        now,
        touchLastSeen: true,
      });
    }
    writeSource(auth.key, personId, planned, now);
  });
  run();

  return { status: 200, body: { ok: true, recorded: true, ...summary() } };
}

module.exports = {
  ensureTables,
  summary,
  publicBoard,
  ingest,
};
