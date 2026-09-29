/**
 * Owner admin client. Talks to same-origin /api/admin/* (proxied to gate-api
 * by vercel.json / vite) so the HttpOnly session cookie stays first-party.
 * Nothing about the session is readable or stored by page JS.
 */
const BASE = "/api/admin";

async function call(path, { method = "GET", body } = {}) {
  try {
    const res = await fetch(BASE + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Oxide-Admin": "1",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      return {
        ok: false,
        status: res.status,
        error: data?.error || "request_failed",
        message: data?.message || `Request failed (HTTP ${res.status}).`,
      };
    }
    return { ...data, ok: true, status: res.status };
  } catch {
    return { ok: false, status: 0, error: "network", message: "Can't reach the admin API." };
  }
}

export function exchangeLoginCode(code) {
  return call("/session/exchange", { method: "POST", body: { code } });
}

export function fetchAdminSession() {
  return call("/session");
}

export function adminLogout() {
  return call("/session/logout", { method: "POST", body: {} });
}

export function fetchAllKeys() {
  return call("/keys");
}

export function runKeyAction(action, key) {
  return call(`/keys/${encodeURIComponent(action)}`, { method: "POST", body: { key } });
}
