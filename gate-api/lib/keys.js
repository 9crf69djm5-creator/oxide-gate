const crypto = require("crypto");
const dbModule = require("./db");

function getDb() { return dbModule.db; }

const PLAN_LABELS = {
  week: "Week",
  month: "Month",
  premium: "Premium",
  lifetime: "Lifetime",
};

/** Plan → default duration days (null = lifetime / never expires) */
const PLAN_DAYS = {
  week: 7,
  month: 30,
  premium: 30,
  lifetime: null,
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeKey(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function planLabel(plan) {
  const id = String(plan || "").toLowerCase();
  return PLAN_LABELS[id] || plan || "Premium";
}

/** Buyers get Oxide.exe only — never a GitHub source repo. */
function downloadUrl() {
  const SITE_EXE = "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";
  const raw = String(process.env.DOWNLOAD_URL || "").trim();
  if (!raw || /^file:/i.test(raw)) return SITE_EXE;
  try {
    const u = new URL(raw);
    if (/github\.com$/i.test(u.hostname) && !/\/releases\/download\//i.test(u.pathname)) {
      return SITE_EXE;
    }
  } catch {
    return SITE_EXE;
  }
  return raw;
}

function generateKey() {
  const seg = () => crypto.randomBytes(2).toString("hex").toUpperCase();
  return `OXIDE-${seg()}-${seg()}-${seg()}`;
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function computeExpires(days) {
  if (days == null || days <= 0) return null; // lifetime
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString();
}

function isExpired(row) {
  if (!row || !row.expires_at) return false;
  return new Date(row.expires_at).getTime() < Date.now();
}

/** Discord snowflake — digits only, typical 17–19 chars. */
function normalizeDiscordUserId(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{5,32}$/.test(s)) return null;
  return s;
}

function maskKey(key) {
  const k = String(key || "");
  const parts = k.split("-");
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1]}-••••-••••`;
  }
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 8)}…••••`;
}

/**
 * Human-readable time left + day count from expires_at ISO.
 * @param {string|null|undefined} expiresAt
 */
function remainingFromExpires(expiresAt) {
  if (!expiresAt) {
    return {
      daysRemaining: null,
      remainingMs: null,
      remainingLabel: "Lifetime",
      expired: false,
    };
  }
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) {
    return {
      daysRemaining: null,
      remainingMs: null,
      remainingLabel: String(expiresAt),
      expired: false,
    };
  }
  const ms = end - Date.now();
  if (ms <= 0) {
    return {
      daysRemaining: 0,
      remainingMs: 0,
      remainingLabel: "Expired",
      expired: true,
    };
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  let remainingLabel;
  if (days >= 2) remainingLabel = `${days} days left`;
  else if (days === 1) remainingLabel = `1 day, ${hours}h left`;
  else if (hours >= 1) remainingLabel = `${hours}h ${mins}m left`;
  else remainingLabel = `${Math.max(1, mins)}m left`;
  return {
    daysRemaining: Math.ceil(ms / 86400000),
    remainingMs: ms,
    remainingLabel,
    expired: false,
  };
}

/**
 * Attach Discord user to a key; one Discord → one key (clears prior links).
 * @param {string} key
 * @param {string} discordUserId
 */
function bindDiscordUser(key, discordUserId) {
  const id = normalizeDiscordUserId(discordUserId);
  if (!id) return { ok: false, error: "invalid_discord", message: "Invalid Discord user id." };
  getDb()
    .prepare(
      "UPDATE keys SET discord_user_id = NULL WHERE discord_user_id = ? AND key != ?"
    )
    .run(id, key);
  getDb()
    .prepare("UPDATE keys SET discord_user_id = ? WHERE key = ?")
    .run(id, key);
  return { ok: true, discordUserId: id };
}

function getByDiscordUserId(rawId) {
  const id = normalizeDiscordUserId(rawId);
  if (!id) return null;
  return getDb()
    .prepare(
      `
      SELECT * FROM keys
      WHERE discord_user_id = ?
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'unused' THEN 1 ELSE 2 END,
        COALESCE(activated_at, created_at) DESC
      LIMIT 1
    `
    )
    .get(id);
}

function getByRobloxUserId(rawId) {
  const id = String(rawId || "").trim();
  if (!id) return null;
  return getDb()
    .prepare(
      `
      SELECT * FROM keys
      WHERE roblox_user_id = ?
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'unused' THEN 1 ELSE 2 END,
        COALESCE(activated_at, created_at) DESC
      LIMIT 1
    `
    )
    .get(id);
}

function listKeysForRobloxUserId(rawId) {
  const id = String(rawId || "").trim();
  if (!id) return [];
  return getDb()
    .prepare(
      `
      SELECT * FROM keys
      WHERE roblox_user_id = ?
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'unused' THEN 1 ELSE 2 END,
        COALESCE(activated_at, created_at) DESC
    `
    )
    .all(id);
}

/**
 * Permanently stamp Roblox identity onto a key (claim / recovery).
 */
function attachRoblox(rawKey, { robloxUserId, robloxUsername }) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "missing_key", message: "Missing key." };
  const row = getKey(key);
  if (!row) return { ok: false, error: "invalid_key", message: "Invalid license key." };

  const rid = String(robloxUserId || "").trim();
  const rname = String(robloxUsername || "").trim() || null;
  if (!rid) {
    return { ok: false, error: "missing_roblox", message: "Missing Roblox user id." };
  }

  getDb()
    .prepare(
      `
      UPDATE keys SET
        roblox_user_id = ?,
        roblox_username = COALESCE(?, roblox_username)
      WHERE key = ?
    `
    )
    .run(rid, rname, key);

  return { ok: true, key, robloxUserId: rid, robloxUsername: rname };
}

/**
 * Attach Discord to every key owned by a Roblox user (and stamp roblox fields).
 * Also pulls keys from roblox_claims that lack keys.roblox_user_id yet.
 */
function attachDiscordToRobloxKeys({ robloxUserId, discordUserId, robloxUsername }) {
  const rid = String(robloxUserId || "").trim();
  const discordId = normalizeDiscordUserId(discordUserId);
  if (!rid || !discordId) return { count: 0, keys: [] };

  // Backfill from claims table
  const claimKeys = getDb()
    .prepare("SELECT key FROM roblox_claims WHERE roblox_user_id = ?")
    .all(rid);
  for (const c of claimKeys) {
    attachRoblox(c.key, { robloxUserId: rid, robloxUsername });
  }

  const rows = listKeysForRobloxUserId(rid);
  const linked = [];
  for (const row of rows) {
    if (row.status === "banned") continue;
    if (
      row.discord_user_id &&
      String(row.discord_user_id) !== String(discordId)
    ) {
      // Already bound to someone else — skip
      continue;
    }
    const bind = bindDiscordUser(row.key, discordId);
    if (bind.ok) {
      attachRoblox(row.key, { robloxUserId: rid, robloxUsername });
      linked.push(row.key);
    }
  }
  return { count: linked.length, keys: linked };
}

/**
 * Public/admin view of a license row (includes remaining time).
 * @param {object} row
 * @param {{ includeFullKey?: boolean }} [opts]
 */
function formatLicense(row, opts = {}) {
  if (!row) return null;
  const rem = remainingFromExpires(row.expires_at);
  let status = row.status;
  if (status === "active" && rem.expired) status = "expired";
  const includeFullKey = opts.includeFullKey !== false;
  const out = {
    plan: planLabel(row.plan),
    planId: row.plan,
    status,
    expires: row.expires_at || null,
    activatedAt: row.activated_at || null,
    discordUserId: row.discord_user_id || null,
    robloxUserId: row.roblox_user_id || null,
    robloxUsername: row.roblox_username || null,
    downloadUrl: downloadUrl(),
    keyMasked: maskKey(row.key),
    daysRemaining: rem.daysRemaining,
    remainingMs: rem.remainingMs,
    remainingLabel: rem.remainingLabel,
    expired: rem.expired,
  };
  if (includeFullKey) out.key = row.key;
  else out.key = out.keyMasked;
  return out;
}

function createKeys({ plan, count, days }) {
  const planId = String(plan || "premium").toLowerCase();
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 500);
  let dayCount;
  if (days === null || days === undefined || days === "") {
    // Omit days → plan default (lifetime stays null; week/month get 7/30)
    dayCount = Object.prototype.hasOwnProperty.call(PLAN_DAYS, planId)
      ? PLAN_DAYS[planId]
      : null;
  } else if (Number(days) <= 0) {
    dayCount = null;
  } else {
    dayCount = Number(days);
  }

  const insert = getDb().prepare(`
    INSERT INTO keys (key, plan, status, hwid, created_at, activated_at, expires_at, token, duration_days)
    VALUES (@key, @plan, 'unused', NULL, @created_at, NULL, NULL, NULL, @duration_days)
  `);

  const created = [];
  const createdAt = nowIso();
  const tx = getDb().transaction(() => {
    for (let i = 0; i < n; i++) {
      let key;
      for (let attempt = 0; attempt < 20; attempt++) {
        key = generateKey();
        try {
          insert.run({
            key,
            plan: planId,
            created_at: createdAt,
            duration_days: dayCount,
          });
          created.push({
            key,
            plan: planId,
            planLabel: planLabel(planId),
            days: dayCount,
            status: "unused",
          });
          break;
        } catch (e) {
          if (e && e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") continue;
          throw e;
        }
      }
    }
  });
  tx();

  return { keys: created, days: dayCount };
}

/**
 * Resolve validity days for a key.
 * IMPORTANT: do not use `null ?? 30` — lifetime plans intentionally use null.
 */
function resolveDurationDays(row, daysOverride) {
  if (daysOverride != null && daysOverride !== "") {
    const n = Number(daysOverride);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (row && row.duration_days != null) {
    const n = Number(row.duration_days);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const planId = String(row?.plan || "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PLAN_DAYS, planId)) {
    return PLAN_DAYS[planId];
  }
  return 30;
}

/** Clear bogus ~30-day expiry that older redeem logic applied to lifetime keys. */
function repairLifetimeKeys() {
  try {
    const info = getDb()
      .prepare(
        `
      UPDATE keys
      SET expires_at = NULL,
          duration_days = NULL,
          status = CASE WHEN status = 'expired' THEN 'active' ELSE status END
      WHERE lower(plan) = 'lifetime'
        AND (
          expires_at IS NOT NULL
          OR duration_days IS NOT NULL
        )
    `
      )
      .run();
    if (info.changes > 0) {
      console.log(`[keys] Repaired ${info.changes} lifetime key(s) (cleared false expiry)`);
    }
  } catch (err) {
    console.warn("[keys] lifetime repair skipped:", err.message);
  }
}

function getKey(key) {
  return getDb().prepare("SELECT * FROM keys WHERE key = ?").get(key);
}

function redeem({ key: rawKey, hwid, daysOverride, discordUserId }) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "missing_key", message: "Enter a license key." };

  const discordId = normalizeDiscordUserId(discordUserId);
  const row = getKey(key);
  if (!row) return { ok: false, error: "invalid_key", message: "Invalid license key." };
  if (row.status === "banned")
    return { ok: false, error: "banned", message: "This key has been banned." };

  if (
    discordId &&
    row.discord_user_id &&
    String(row.discord_user_id) !== String(discordId)
  ) {
    return {
      ok: false,
      error: "discord_bound",
      message: "This key is already linked to another Discord account.",
    };
  }

  if (row.status === "active") {
    if (isExpired(row)) {
      getDb().prepare("UPDATE keys SET status = 'expired' WHERE key = ?").run(key);
      return { ok: false, error: "expired", message: "This key has expired." };
    }
    if (row.hwid && hwid && row.hwid !== hwid) {
      return {
        ok: false,
        error: "hwid_mismatch",
        message: "This key is bound to another machine.",
      };
    }
    // Re-redeem / website redeem without HWID: return existing session
    let token = row.token;
    if (!token) {
      token = makeToken();
      getDb().prepare("UPDATE keys SET token = ? WHERE key = ?").run(token, key);
    }
    if (hwid && !row.hwid) {
      getDb().prepare("UPDATE keys SET hwid = ? WHERE key = ?").run(hwid, key);
    }
    if (discordId) {
      const bind = bindDiscordUser(key, discordId);
      if (!bind.ok) return bind;
    }
    const fresh = getKey(key);
    const license = formatLicense(fresh, { includeFullKey: true });
    return {
      ok: true,
      plan: license.plan,
      planId: license.planId,
      expires: license.expires,
      downloadUrl: license.downloadUrl,
      token,
      key,
      alreadyActive: true,
      discordUserId: license.discordUserId,
      daysRemaining: license.daysRemaining,
      remainingLabel: license.remainingLabel,
      remainingMs: license.remainingMs,
      status: license.status,
      keyMasked: license.keyMasked,
    };
  }

  if (row.status !== "unused" && row.status !== "expired") {
    return { ok: false, error: "invalid_status", message: `Key status: ${row.status}` };
  }

  const days = resolveDurationDays(row, daysOverride);

  const activated = nowIso();
  const expires = computeExpires(days);
  const token = makeToken();

  getDb().prepare(
    `
    UPDATE keys SET
      status = 'active',
      hwid = COALESCE(?, hwid),
      activated_at = ?,
      expires_at = ?,
      token = ?
    WHERE key = ?
  `
  ).run(hwid || null, activated, expires, token, key);

  if (discordId) {
    const bind = bindDiscordUser(key, discordId);
    if (!bind.ok) return bind;
  }

  const fresh = getKey(key);
  const license = formatLicense(fresh, { includeFullKey: true });
  return {
    ok: true,
    plan: license.plan,
    planId: license.planId,
    expires: license.expires,
    downloadUrl: license.downloadUrl,
    token,
    key,
    alreadyActive: false,
    discordUserId: license.discordUserId,
    daysRemaining: license.daysRemaining,
    remainingLabel: license.remainingLabel,
    remainingMs: license.remainingMs,
    status: license.status,
    keyMasked: license.keyMasked,
  };
}

/**
 * Link an existing (or unused) key to a Discord user — same rules as redeem + bind.
 * Prefer for site-redeemed keys that need Discord attachment afterward.
 */
function linkDiscord({ key: rawKey, discordUserId }) {
  const discordId = normalizeDiscordUserId(discordUserId);
  if (!discordId) {
    return { ok: false, error: "invalid_discord", message: "Invalid Discord user id." };
  }
  // Reuse redeem path so unused keys activate and active keys re-link.
  return redeem({ key: rawKey, discordUserId: discordId });
}

/**
 * Lookup license saved for a Discord user (bot /mykey).
 */
function licenseForDiscord(discordUserId) {
  const row = getByDiscordUserId(discordUserId);
  if (!row) {
    return {
      ok: false,
      error: "not_linked",
      message: "No license linked to this Discord account. Use /redeem with your OXIDE key.",
    };
  }
  if (row.status === "banned") {
    return { ok: false, error: "banned", message: "This key has been banned." };
  }
  if (row.status === "active" && isExpired(row)) {
    getDb().prepare("UPDATE keys SET status = 'expired' WHERE key = ?").run(row.key);
    const license = formatLicense({ ...row, status: "expired" }, { includeFullKey: true });
    return {
      ok: false,
      error: "expired",
      message: "This key has expired.",
      ...license,
    };
  }
  const license = formatLicense(row, { includeFullKey: true });
  return { ok: true, ...license };
}

function validate({ key: rawKey, hwid, token }) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "missing_key", message: "Missing license key." };
  if (!hwid) return { ok: false, error: "missing_hwid", message: "Missing HWID." };

  const row = getKey(key);
  if (!row) return { ok: false, error: "invalid_key", message: "Invalid license key." };
  if (row.status === "banned")
    return { ok: false, error: "banned", message: "This key has been banned." };
  if (row.status === "unused")
    return {
      ok: false,
      error: "not_activated",
      message: "Key not activated. Redeem on the website first, or activate here.",
    };
  if (row.status !== "active")
    return { ok: false, error: "invalid_status", message: `Key status: ${row.status}` };

  if (isExpired(row)) {
    getDb().prepare("UPDATE keys SET status = 'expired' WHERE key = ?").run(key);
    return { ok: false, error: "expired", message: "This key has expired." };
  }

  if (row.hwid && row.hwid !== hwid) {
    return {
      ok: false,
      error: "hwid_mismatch",
      message: "HWID mismatch. This key is bound to another machine.",
    };
  }

  // First EXE launch can bind HWID if redeem was website-only
  if (!row.hwid) {
    getDb().prepare("UPDATE keys SET hwid = ? WHERE key = ?").run(hwid, key);
  }

  let outToken = row.token;
  if (token && row.token && token !== row.token) {
    // Soft: allow key+hwid without matching token; refresh token
    outToken = makeToken();
    getDb().prepare("UPDATE keys SET token = ? WHERE key = ?").run(outToken, key);
  } else if (!outToken) {
    outToken = makeToken();
    getDb().prepare("UPDATE keys SET token = ? WHERE key = ?").run(outToken, key);
  }

  return {
    ok: true,
    plan: planLabel(row.plan),
    planId: row.plan,
    expires: row.expires_at,
    token: outToken,
    key,
  };
}

/** Allow EXE first-run: unused key + hwid → activate (same as redeem with hwid) */
function validateOrActivate({ key, hwid, token }) {
  const normalized = normalizeKey(key);
  const row = getKey(normalized);
  if (row && row.status === "unused") {
    return redeem({ key: normalized, hwid });
  }
  return validate({ key: normalized, hwid, token });
}

/** Ban / revoke a key (status → banned). */
function revokeKey({ key: rawKey }) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "missing_key", message: "Enter a license key." };
  const row = getKey(key);
  if (!row) return { ok: false, error: "invalid_key", message: "Invalid license key." };
  getDb()
    .prepare("UPDATE keys SET status = 'banned', token = NULL WHERE key = ?")
    .run(key);
  return {
    ok: true,
    key,
    plan: planLabel(row.plan),
    planId: row.plan,
    previousStatus: row.status,
    message: "Key revoked (banned).",
  };
}

/** Clear HWID binding so the key can activate on a new machine. */
function resetHwid({ key: rawKey }) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "missing_key", message: "Enter a license key." };
  const row = getKey(key);
  if (!row) return { ok: false, error: "invalid_key", message: "Invalid license key." };
  if (row.status === "banned") {
    return { ok: false, error: "banned", message: "This key has been banned." };
  }
  getDb().prepare("UPDATE keys SET hwid = NULL WHERE key = ?").run(key);
  return {
    ok: true,
    key,
    plan: planLabel(row.plan),
    planId: row.plan,
    previousHwid: row.hwid || null,
    message: "HWID cleared. Next EXE launch will bind a new machine.",
  };
}

function seedDemoKeys() {
  const demos = [
    { key: "OXIDE-DEMO-WEEK", plan: "week" },
    { key: "OXIDE-DEMO-LIFE", plan: "lifetime" },
    { key: "OXIDE-DEMO-MONTH", plan: "month" },
  ];
  const insert = getDb().prepare(`
    INSERT OR IGNORE INTO keys (key, plan, status, hwid, created_at, activated_at, expires_at, token, duration_days)
    VALUES (@key, @plan, 'unused', NULL, @created_at, NULL, NULL, NULL, @duration_days)
  `);
  const createdAt = nowIso();
  const planDays = { week: 7, month: 30, lifetime: null };
  for (const d of demos) {
    // Use planDays[d.plan] as-is — null means lifetime (do NOT coalesce to 30)
    insert.run({
      ...d,
      created_at: createdAt,
      duration_days: Object.prototype.hasOwnProperty.call(planDays, d.plan)
        ? planDays[d.plan]
        : 30,
    });
  }
  return demos.map((d) => d.key);
}

module.exports = {
  normalizeKey,
  normalizeDiscordUserId,
  createKeys,
  redeem,
  linkDiscord,
  licenseForDiscord,
  formatLicense,
  remainingFromExpires,
  maskKey,
  validate,
  validateOrActivate,
  revokeKey,
  resetHwid,
  seedDemoKeys,
  repairLifetimeKeys,
  resolveDurationDays,
  planLabel,
  PLAN_DAYS,
  getKey,
  getByDiscordUserId,
  getByRobloxUserId,
  listKeysForRobloxUserId,
  attachRoblox,
  attachDiscordToRobloxKeys,
  bindDiscordUser,
};
