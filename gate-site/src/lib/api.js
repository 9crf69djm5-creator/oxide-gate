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
    const session = {
      key: data.key || key,
      plan: data.plan || "Premium",
      redeemedAt: Date.now(),
      expiresAt,
      token: data.token || null,
      downloadUrl: data.downloadUrl || config.download?.url || "",
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

