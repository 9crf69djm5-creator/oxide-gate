import { config } from "../config";
import { loadSession, saveSession } from "./session";

export function apiBase() {
  return String(config.API_BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
}

export async function redeemKey(raw) {
  const key = String(raw || "")
    .trim()
    .toUpperCase();
  if (!key) return { ok: false, message: "Enter a license key." };

  try {
    const res = await fetch(apiBase() + "/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok || !data || !data.ok) {
      return {
        ok: false,
        message:
          (data && data.message) ||
          "Redeem failed. Is gate-api running at " + apiBase() + "?",
      };
    }

    const expiresAt = data.expires ? new Date(data.expires).getTime() : null;
    const prev = loadSession() || {};
    const siteExe =
      config.download?.url || "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";
    let downloadUrl = String(data.downloadUrl || siteExe || "").trim() || siteExe;
    try {
      const u = new URL(downloadUrl);
      if (/github\.com$/i.test(u.hostname) && !/\/releases\/download\//i.test(u.pathname)) {
        downloadUrl = siteExe;
      }
    } catch {
      downloadUrl = siteExe;
    }
    if (/^file:/i.test(downloadUrl)) downloadUrl = siteExe;
    const session = {
      key: data.key || key,
      plan: data.plan || "Premium",
      redeemedAt: Date.now(),
      expiresAt,
      token: data.token || null,
      downloadUrl,
      discordLinked: !!prev.discordLinked,
      discordUser: prev.discordUser || null,
    };
    saveSession(session);
    return { ok: true, message: "Key redeemed. Access unlocked.", session };
  } catch {
    return {
      ok: false,
      message:
        "Can't reach auth server (" +
        apiBase() +
        "). Start gate-api or set VITE_API_BASE_URL to your hosted API.",
    };
  }
}

export function checkoutUrlFor(plan) {
  if (plan?.checkoutUrl) return plan.checkoutUrl;
  const p = config.payment || {};
  if (p.provider === "roblox" && p.robloxPassUrl) return p.robloxPassUrl;
  return p.checkoutUrl || "#checkout-placeholder";
}

export function openCheckout(plan) {
  const url = checkoutUrlFor(plan);
  if (!url || url === "#checkout-placeholder") {
    window.alert(
      "Checkout URL not configured yet.\n\nEdit gate-site/src/config.js → payment.checkoutUrl\n(SellApp product link recommended).\n\nOr use Pay with Roblox on this page after setting asset IDs on gate-api.\n\nAfter payment, redeem your key on Get a key."
    );
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Fetch Roblox product catalog (buy links + plan metadata) from gate-api. */
export async function fetchProducts() {
  try {
    const res = await fetch(apiBase() + "/api/products");
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      return {
        ok: false,
        message: (data && data.message) || "Could not load Roblox products.",
        products: [],
        demo: false,
      };
    }
    return {
      ok: true,
      products: data.products || [],
      demo: !!data.demo,
      discordInvite: data.discordInvite || config.discordInvite,
    };
  } catch {
    return {
      ok: false,
      message: "Can't reach auth server (" + apiBase() + ").",
      products: [],
      demo: false,
    };
  }
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

/**
 * Public offsets dump from gate-api (live dumper upload or exported offsets.h).
 */
export async function fetchOffsets() {
  const base = apiBase();
  try {
    const res = await fetch(`${base}/api/offsets`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok) {
      return {
        ok: true,
        source: body.source || "OXIDE",
        robloxVersion: body.robloxVersion || null,
        generatedAt: body.generatedAt || null,
        totalOffsets: body.totalOffsets || 0,
        namespaces: body.namespaces || {},
        dumpedWith: body.dumpedWith || null,
      };
    }
  } catch {
    /* fall through to static site copy */
  }

  try {
    const res = await fetch("/offsets.json", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body?.ok) {
      return {
        ok: true,
        source: body.source || "OXIDE",
        robloxVersion: body.robloxVersion || null,
        generatedAt: body.generatedAt || null,
        totalOffsets: body.totalOffsets || 0,
        namespaces: body.namespaces || {},
        dumpedWith: body.dumpedWith || null,
      };
    }
  } catch (err) {
    return {
      ok: false,
      message: err?.message || `Can't reach ${base}/api/offsets`,
    };
  }

  return {
    ok: false,
    message: `Could not load offsets from ${base}/api/offsets or /offsets.json`,
  };
}

/**
 * Probe gate-api status + Discord bot for /status and home strip.
 * Never surfaces secrets — only online/latency/versions/update flags.
 */
export async function fetchSystemStatus() {
  const base = apiBase();
  const botHealth = String(
    config.discordBotHealthUrl || "https://oxide-discord-bot-fra.onrender.com/"
  ).replace(/\/?$/, "/");
  const downloadUrl = config.download?.url || `${base}/downloads/Oxide.exe`;
  const checkedAt = Date.now();

  const timed = async (fn) => {
    const started = Date.now();
    try {
      const result = await fn();
      return { ...result, latency: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        state: "offline",
        error: err?.message || "unreachable",
        latency: Date.now() - started,
      };
    }
  };

  const [agg, bot] = await Promise.all([
    timed(async () => {
      const res = await fetch(`${base}/api/status`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        return { ok: true, state: "online", status: res.status, body, mode: "status" };
      }
      // Fallback for older API deploys without /api/status
      const healthRes = await fetch(`${base}/api/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      const health = await healthRes.json().catch(() => null);
      return {
        ok: healthRes.ok && health?.ok !== false,
        state: healthRes.ok && health?.ok !== false ? "online" : "offline",
        status: healthRes.status,
        body: { api: health, download: null, products: null, external: null },
        mode: "health",
      };
    }),
    timed(async () => {
      const res = await fetch(botHealth, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      const body = await res.json().catch(() => null);
      const ready = body?.ready === true || body?.ok === true;
      const ok = res.ok && (ready || body?.service === "oxide-discord-bot");
      const state =
        ok && body?.ready !== false ? "online" : res.ok ? "degraded" : "offline";
      return { ok, state, status: res.status, body };
    }),
  ]);

  const snap = agg.body || {};
  const apiBody = snap.api || snap;
  const download = snap.download || {};
  const products = snap.products || {};
  const external = snap.external || {};

  // Prefer server-side bot probe from gate-api (no browser CORS on bot host).
  // Fall back to direct health fetch when aggregate has no bot field.
  let botResult = bot;
  if (snap.bot && typeof snap.bot === "object") {
    const b = snap.bot;
    const ready = b.ready === true || b.ok === true;
    const ok = Boolean(ready || b.service === "oxide-discord-bot");
    botResult = {
      ok,
      state:
        ok && b.ready !== false ? "online" : ok || b.status ? "degraded" : "offline",
      status: b.status || (ok ? 200 : 0),
      body: b,
      latency: b.latencyMs != null ? b.latencyMs : bot.latency,
    };
  }

  const apiOnline = Boolean(agg.ok);
  const dlAvailable =
    download.available === true ||
    apiBody?.downloadAvailable === true ||
    apiBody?.downloadConfigured === true;

  let dlState = "offline";
  if (apiOnline && download.available === true) dlState = "online";
  else if (apiOnline && apiBody?.downloadConfigured) dlState = "degraded";
  else if (!apiOnline) {
    // Last-resort HEAD probe when aggregate endpoint is down
    const probe = await timed(async () => {
      const res = await fetch(downloadUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(20000),
      });
      const ok = res.ok || res.status === 206;
      return { ok, state: ok ? "online" : "offline", status: res.status };
    });
    dlState = probe.state;
  }

  const configured = products.configured ?? apiBody?.robloxProductsConfigured ?? 0;
  const total = products.total ?? configured;
  const productsState =
    apiOnline && configured > 0 ? "online" : apiOnline ? "degraded" : "offline";

  let externalState = "unknown";
  if (external.status === "current" || external.updateNeeded === false) {
    externalState = "online";
  } else if (external.status === "update_needed" || external.updateNeeded === true) {
    externalState = "degraded";
  } else if (apiOnline && (external.hostedClientVersion || external.liveRobloxVersion)) {
    externalState = "degraded";
  } else if (!apiOnline) {
    externalState = "offline";
  }

  const sizeLabel =
    download.sizeLabel ||
    formatBytes(download.sizeBytes ?? apiBody?.downloadSizeBytes) ||
    null;
  const modifiedLabel =
    formatDate(download.modifiedAt || apiBody?.downloadModifiedAt) || null;

  const items = [
    {
      id: "api",
      name: "Gate API",
      detail: "License redeem, products, downloads",
      state: apiOnline ? "online" : "offline",
      latency: agg.latency,
      fields: [
        { label: "Reachable", value: apiOnline ? "Yes" : "No" },
        {
          label: "Database",
          value: apiBody?.dbEphemeral
            ? "Ephemeral (risk)"
            : apiBody?.dbBackend || "—",
        },
        {
          label: "Latency",
          value: agg.latency != null ? `${agg.latency}ms` : "—",
        },
      ],
    },
    {
      id: "downloads",
      name: "Oxide.exe download",
      detail: "Hosted binary for buyers",
      state: dlState,
      latency: null,
      fields: [
        { label: "Available", value: dlAvailable ? "Yes" : "No" },
        { label: "Size", value: sizeLabel || "—" },
        { label: "Updated", value: modifiedLabel || "—" },
      ],
    },
    {
      id: "products",
      name: "Products / gamepasses",
      detail: "Week · Month · Lifetime",
      state: productsState,
      latency: null,
      fields: [
        {
          label: "Configured",
          value: `${configured} / ${total || "?"}`,
        },
        {
          label: "Plans",
          value:
            (products.items || [])
              .filter((p) => p.configured)
              .map((p) => p.name || p.plan)
              .join(", ") || "—",
        },
        { label: "Demo mode", value: products.demo || apiBody?.robloxDemo ? "On" : "Off" },
      ],
    },
    {
      id: "external",
      name: "External / Roblox version",
      detail: external.message || "Hosted offsets vs live Windows client",
      state: externalState,
      latency: null,
      fields: [
        {
          label: "Update needed",
          value:
            external.updateNeeded === true
              ? "Yes"
              : external.updateNeeded === false
                ? "No"
                : "Unknown",
        },
        {
          label: "Hosted target",
          value: external.hostedClientVersion || apiBody?.hostedClientVersion || "—",
        },
        {
          label: "Live Roblox",
          value: external.liveRobloxVersion || "—",
        },
      ],
    },
    {
      id: "bot",
      name: "Discord bot",
      detail: "Community + verify gate",
      state: botResult.state || (botResult.ok ? "online" : "offline"),
      latency: botResult.latency,
      fields: [
        {
          label: "Ready",
          value:
            botResult.body?.ready === true
              ? "Yes"
              : botResult.body?.ready === false
                ? "No"
                : botResult.ok
                  ? "Responding"
                  : "—",
        },
        {
          label: "Bot",
          value: botResult.body?.user || botResult.body?.service || "—",
        },
        {
          label: "Latency",
          value: botResult.latency != null ? `${botResult.latency}ms` : "—",
        },
      ],
    },
  ];

  const states = items.map((i) => i.state);
  let overall = "online";
  if (states.every((s) => s === "offline")) overall = "offline";
  else if (states.some((s) => s !== "online" && s !== "unknown")) overall = "degraded";
  else if (states.some((s) => s === "unknown")) overall = "degraded";

  return {
    checkedAt,
    overall,
    items,
    external,
    updateNeeded: external.updateNeeded === true,
  };
}

export async function claimRobloxKey({ username, plan }) {
  const name = String(username || "").trim();
  const planId = String(plan || "").trim().toLowerCase();
  if (!name) return { ok: false, message: "Enter your Roblox username." };
  if (!planId) return { ok: false, message: "Choose a plan." };

  try {
    const res = await fetch(apiBase() + "/api/roblox/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name, plan: planId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      return {
        ok: false,
        message:
          (data && data.message) ||
          "Claim failed. Buy the item on Roblox first, then try again.",
        buyUrl: data && data.buyUrl,
        error: data && data.error,
      };
    }
    return {
      ok: true,
      message: data.message || "Key ready.",
      key: data.key,
      plan: data.plan,
      planId: data.planId,
      alreadyClaimed: !!data.alreadyClaimed,
      demo: !!data.demo,
      buyUrl: data.buyUrl,
    };
  } catch {
    return {
      ok: false,
      message:
        "Can't reach auth server (" +
        apiBase() +
        "). Start gate-api or set VITE_API_BASE_URL.",
    };
  }
}
