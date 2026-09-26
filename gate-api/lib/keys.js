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

function redeem({ key: rawKey, hwid, daysOverride }) {
  const key = normalizeKey(rawKey);
  if (!key) return { ok: false, error: "missing_key", message: "Enter a license key." };

  const row = getKey(key);
  if (!row) return { ok: false, error: "invalid_key", message: "Invalid license key." };
  if (row.status === "banned")
    return { ok: false, error: "banned", message: "This key has been banned." };

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
    return {
      ok: true,
      plan: planLabel(row.plan),
      planId: row.plan,
      expires: row.expires_at,
      downloadUrl: downloadUrl(),
      token,
      key,
      alreadyActive: true,
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

  return {
    ok: true,
    plan: planLabel(row.plan),
    planId: row.plan,
    expires,
    downloadUrl: downloadUrl(),
    token,
    key,
    alreadyActive: false,
  };
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
  createKeys,
  redeem,
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
};
