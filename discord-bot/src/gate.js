"use strict";

/**
 * @param {string} apiBaseUrl
 */
async function fetchHealth(apiBaseUrl) {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/health`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
    // Free Render cold starts often exceed 10s; interaction is already deferred.
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
 * Redeem / activate a license key (HWID optional — EXE binds later).
 * @param {object} opts
 * @param {string} opts.apiBaseUrl
 * @param {string} opts.key
 * @param {string} [opts.hwid]
 */
async function redeemKey(opts) {
  const url = `${opts.apiBaseUrl.replace(/\/$/, "")}/api/redeem`;
  const payload = { key: String(opts.key || "").trim() };
  if (opts.hwid) payload.hwid = opts.hwid;

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

module.exports = { fetchHealth, createKeys, redeemKey };
