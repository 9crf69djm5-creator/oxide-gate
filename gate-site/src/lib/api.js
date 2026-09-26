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
    // Never persist a GitHub repo / source-tree link for buyers.
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

/**
 * Claim an OXIDE key after buying the mapped Shirt / Gamepass on Roblox.
 * Body handled server-side: { username, plan }
 */
/**
 * Probe gate-api, downloads, products, and Discord bot health for /status.
 */
export async function fetchSystemStatus() {
  const base = apiBase();
  const botHealth =
    String(config.discordBotHealthUrl || "https://oxide-discord-bot-fra.onrender.com/").replace(
      /\/?$/,
      "/"
    );
  const downloadUrl =
    config.download?.url || `${base}/downloads/Oxide.exe`;
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

  const [api, downloads, products, bot] = await Promise.all([
    timed(async () => {
      const res = await fetch(`${base}/api/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      const body = await res.json().catch(() => null);
      const ok = res.ok && body?.ok !== false;
      return {
        ok,
        state: ok ? "online" : "offline",
        status: res.status,
        body,
      };
    }),
    timed(async () => {
      const res = await fetch(downloadUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(25000),
      });
      // Some hosts reject HEAD — fall back to ranged GET
      if (res.status === 405 || res.status === 501) {
        const getRes = await fetch(downloadUrl, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          signal: AbortSignal.timeout(25000),
        });
        const ok = getRes.ok || getRes.status === 206;
        return { ok, state: ok ? "online" : "offline", status: getRes.status };
      }
      const ok = res.ok || res.status === 206;
      return { ok, state: ok ? "online" : "offline", status: res.status };
    }),
    timed(async () => {
      const res = await fetch(`${base}/api/products`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(25000),
      });
      const body = await res.json().catch(() => null);
      const list = body?.products || [];
      const configured = list.filter((p) => p.configured).length;
      const ok = res.ok && body?.ok !== false;
      const state =
        ok && configured > 0 ? "online" : ok ? "degraded" : "offline";
      return {
        ok,
        state,
        status: res.status,
        body,
        configured,
        total: list.length,
        demo: !!body?.demo,
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
      const state = ok && body?.ready !== false ? "online" : res.ok ? "degraded" : "offline";
      return {
        ok,
        state,
        status: res.status,
        body,
      };
    }),
  ]);

  const items = [
    {
      id: "api",
      name: "Gate API",
      detail: base,
      state: api.state || (api.ok ? "online" : "offline"),
      latency: api.latency,
      fields: [
        { label: "HTTP", value: String(api.status ?? "—") },
        {
          label: "Database",
          value: api.body?.dbEphemeral
            ? "Ephemeral (risk)"
            : api.body?.dbBackend || api.body?.db || "—",
        },
        {
          label: "Download flag",
          value: api.body?.downloadConfigured ? "Configured" : "Missing",
        },
      ],
    },
    {
      id: "downloads",
      name: "Downloads",
      detail: downloadUrl,
      state: downloads.state || (downloads.ok ? "online" : "offline"),
      latency: downloads.latency,
      fields: [
        { label: "HTTP", value: String(downloads.status ?? "—") },
        { label: "File", value: "Oxide.exe" },
      ],
    },
    {
      id: "products",
      name: "Products / gamepasses",
      detail: `${base}/api/products`,
      state: products.state || (products.ok ? "online" : "offline"),
      latency: products.latency,
      fields: [
        {
          label: "Configured",
          value:
            products.configured != null
              ? `${products.configured} / ${products.total ?? "?"}`
              : "—",
        },
        { label: "Demo mode", value: products.demo ? "On" : "Off" },
      ],
    },
    {
      id: "bot",
      name: "Discord bot",
      detail: botHealth,
      state: bot.state || (bot.ok ? "online" : "offline"),
      latency: bot.latency,
      fields: [
        { label: "HTTP", value: String(bot.status ?? "—") },
        {
          label: "Ready",
          value:
            bot.body?.ready === true
              ? "Yes"
              : bot.body?.ready === false
                ? "No"
                : bot.ok
                  ? "Responding"
                  : "—",
        },
        {
          label: "Identity",
          value: bot.body?.user || bot.body?.service || "—",
        },
      ],
    },
  ];

  const states = items.map((i) => i.state);
  let overall = "online";
  if (states.every((s) => s === "offline")) overall = "offline";
  else if (states.some((s) => s !== "online")) overall = "degraded";

  return { checkedAt, overall, items };
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

