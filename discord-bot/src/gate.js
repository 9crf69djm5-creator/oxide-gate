"use strict";

/**
 * @param {string} apiBaseUrl
 */
async function fetchHealth(apiBaseUrl) {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/health`;
  const started = Date.now();
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
    signal: AbortSignal.timeout(10000),
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
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

module.exports = { fetchHealth, createKeys };
