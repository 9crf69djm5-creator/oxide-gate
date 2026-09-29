/**
 * Owner admin client. Talks to same-origin /api/admin/* (proxied to gate-api
 * by vercel.json / vite) so the HttpOnly session cookie stays first-party.
 * Nothing about the session is readable or stored by page JS.
 *
 * The only thing kept in localStorage is a "this browser signed in as owner
 * before" hint. It grants nothing: it just decides whether the nav asks the
 * server for a session, so anonymous visitors never call /api/admin/*.
 */
import { useEffect, useState } from "react";

const BASE = "/api/admin";
const HINT_KEY = "oxide_owner_hint";
const OWNER_EVENT = "oxide:owner";
/** Proxy/cold-start failures (Render waking up behind the Vercel rewrite). */
const TRANSIENT = new Set([0, 502, 503, 504]);
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];

export function ownerHinted() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function setOwnerHint(on) {
  if (ownerHinted() === on) return;
  try {
    if (on) localStorage.setItem(HINT_KEY, "1");
    else localStorage.removeItem(HINT_KEY);
  } catch {
    /* storage disabled */
  }
  window.dispatchEvent(new Event(OWNER_EVENT));
}

async function call(path, { method = "GET", body, retryTransient = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await callOnce(path, { method, body });
    if (r.status === 401 || r.status === 404) setOwnerHint(false);
    if (r.ok || !retryTransient || !TRANSIENT.has(r.status) || attempt >= RETRY_DELAYS_MS.length) {
      return r;
    }
    await new Promise((res) => setTimeout(res, RETRY_DELAYS_MS[attempt]));
  }
}

async function callOnce(path, { method, body }) {
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

export async function exchangeLoginCode(code) {
  const r = await call("/session/exchange", { method: "POST", body: { code }, retryTransient: true });
  if (r.ok) setOwnerHint(true);
  return r;
}

export async function fetchAdminSession({ retryTransient = false } = {}) {
  const r = await call("/session", { retryTransient });
  if (r.ok) setOwnerHint(true);
  return r;
}

export async function adminLogout() {
  const r = await call("/session/logout", { method: "POST", body: {} });
  setOwnerHint(false);
  return r;
}

export function fetchAllKeys() {
  return call("/keys");
}

export function runKeyAction(action, key) {
  return call(`/keys/${encodeURIComponent(action)}`, { method: "POST", body: { key } });
}

/**
 * Server-confirmed owner session for this browser, or null. Only asks the
 * server when the owner hint is set; re-checks whenever the hint changes.
 */
export function useOwnerSession() {
  const [owner, setOwner] = useState(null);

  useEffect(() => {
    let alive = true;
    const check = () => {
      if (!ownerHinted()) {
        setOwner(null);
        return;
      }
      fetchAdminSession().then((s) => {
        if (alive) setOwner(s.ok ? s : null);
      });
    };
    check();
    window.addEventListener(OWNER_EVENT, check);
    return () => {
      alive = false;
      window.removeEventListener(OWNER_EVENT, check);
    };
  }, []);

  return owner;
}
