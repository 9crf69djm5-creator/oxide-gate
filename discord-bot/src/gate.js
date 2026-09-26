"use strict";

/**
 * @param {string} apiBaseUrl
 */
async function fetchHealth(apiBaseUrl) {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/health`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
    signal: AbortSignal.timeout(45000),
  });
  const ms = Date.now() - started;
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, ms, body, url };
}

/**
 * @param {string} apiBaseUrl
 */
async function fetchProducts(apiBaseUrl) {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/products`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
    signal: AbortSignal.timeout(45000),
  });
  const ms = Date.now() - started;
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, ms, body, url };
}

/**
 * @param {string} downloadUrl
 */
async function probeDownload(downloadUrl) {
  const started = Date.now();
  try {
    let res = await fetch(downloadUrl, {
      method: "HEAD",
      headers: { "User-Agent": "OXIDE-DiscordBot/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(downloadUrl, {
        method: "GET",
        headers: {
          Range: "bytes=0-0",
          "User-Agent": "OXIDE-DiscordBot/1.0",
        },
        signal: AbortSignal.timeout(25000),
      });
    }
    const ms = Date.now() - started;
    const ok = res.ok || res.status === 206;
    return { ok, status: res.status, ms, url: downloadUrl };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      url: downloadUrl,
      error: err.message,
    };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.apiBaseUrl
 * @param {string} opts.adminSecret
 * @param {string} [opts.plan]
 * @param {number} [opts.count]
 * @param {number} [opts.days]
 */
async function createKeys(opts) {
  const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/admin/create-keys`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Admin-Secret": opts.adminSecret,
      "User-Agent": "OXIDE-DiscordBot/1.0",
    },
    body: JSON.stringify({
      plan: opts.plan || "premium",
      count: opts.count ?? 1,
      days: opts.days,
    }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/**
 * @param {object} opts
 * @param {string} opts.apiBaseUrl
 * @param {string} opts.adminSecret
 * @param {string} opts.key
 */
async function revokeKey(opts) {
  const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/admin/revoke-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Admin-Secret": opts.adminSecret,
      "User-Agent": "OXIDE-DiscordBot/1.0",
    },
    body: JSON.stringify({ key: opts.key }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

/**
 * @param {object} opts
 * @param {string} opts.apiBaseUrl
 * @param {string} opts.adminSecret
 * @param {string} opts.key
 */
async function resetHwid(opts) {
  const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/admin/reset-hwid`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Admin-Secret": opts.adminSecret,
      "User-Agent": "OXIDE-DiscordBot/1.0",
    },
    body: JSON.stringify({ key: opts.key }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

/**
 * Redeem / activate a license key (HWID optional — EXE binds later).
 * Pass discordUserId so gate-api stores the Discord ↔ key link.
 * @param {object} opts
 * @param {string} opts.apiBaseUrl
 * @param {string} opts.key
 * @param {string} [opts.hwid]
 * @param {string} [opts.discordUserId]
 */
async function redeemKey(opts) {
  const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/redeem`;
  const payload = { key: String(opts.key || "").trim() };
  if (opts.hwid) payload.hwid = opts.hwid;
  if (opts.discordUserId) payload.discordUserId = String(opts.discordUserId);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "OXIDE-DiscordBot/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

/**
 * Link an existing key to Discord (same as redeem + bind on API).
 * @param {object} opts
 */
async function linkDiscordKey(opts) {
  const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/discord/link`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "OXIDE-DiscordBot/1.0",
    },
    body: JSON.stringify({
      key: String(opts.key || "").trim(),
      discordUserId: String(opts.discordUserId || ""),
    }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

/**
 * Fetch license linked to a Discord user (requires ADMIN_SECRET).
 * @param {object} opts
 */
async function fetchLicenseByDiscord(opts) {
  const base = opts.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}/api/admin/license-by-discord?discordUserId=${encodeURIComponent(
    String(opts.discordUserId || "")
  )}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Admin-Secret": opts.adminSecret,
      "User-Agent": "OXIDE-DiscordBot/1.0",
    },
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

module.exports = {
  fetchHealth,
  fetchProducts,
  probeDownload,
  createKeys,
  revokeKey,
  resetHwid,
  redeemKey,
  linkDiscordKey,
  fetchLicenseByDiscord,
};
