/**
 * Roblox product map + ownership checks.
 *
 * Public inventory endpoints often work without auth for public assets.
 * If Roblox starts requiring cookies (private inventory / rate limits),
 * set ROBLOX_COOKIE to a .ROBLOSECURITY value from an alt account.
 *
 * DEMO_ROBLOX=1 skips ownership verification (local / staging only).
 */

const PLAN_META = {
  week: {
    id: "week",
    name: "Week",
    days: 7,
    price: 5,
    unit: "USD",
    blurb: "Seven days. Buy the Week shirt on Roblox, then claim your key.",
    productKind: "Asset",
    envKeys: ["ROBLOX_ASSET_WEEK", "ROBLOX_SHIRT_WEEK"],
  },
  month: {
    id: "month",
    name: "Month",
    days: 30,
    price: 12,
    unit: "USD",
    blurb: "Thirty days. Buy the Month shirt on Roblox, then claim your key.",
    productKind: "Asset",
    envKeys: ["ROBLOX_ASSET_MONTH", "ROBLOX_SHIRT_MONTH"],
  },
  lifetime: {
    id: "lifetime",
    name: "Lifetime",
    days: null,
    price: 40,
    unit: "USD",
    blurb: "No renewals. Buy the Lifetime gamepass on Roblox, then claim your key.",
    productKind: "GamePass",
    envKeys: ["ROBLOX_GAMEPASS_LIFETIME", "ROBLOX_ASSET_LIFETIME"],
  },
  premium: {
    id: "premium",
    name: "Premium",
    days: 30,
    price: 15,
    unit: "USD",
    blurb: "Premium access via Roblox purchase.",
    productKind: "Asset",
    envKeys: ["ROBLOX_ASSET_PREMIUM", "ROBLOX_SHIRT_PREMIUM"],
  },
};

function parseProductMap() {
  const raw = process.env.ROBLOX_PRODUCT_MAP || process.env.ROBLOX_ASSET_IDS;
  if (!raw || !String(raw).trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (err) {
    console.warn("[roblox] Invalid ROBLOX_PRODUCT_MAP / ROBLOX_ASSET_IDS JSON:", err.message);
  }
  return {};
}

function catalogUrl(assetId, kind) {
  const id = String(assetId);
  if (String(kind).toLowerCase() === "gamepass") {
    return `https://www.roblox.com/game-pass/${id}`;
  }
  return `https://www.roblox.com/catalog/${id}`;
}

function resolveProduct(planId) {
  const id = String(planId || "").toLowerCase();
  const meta = PLAN_META[id];
  if (!meta) return null;

  const map = parseProductMap();
  const fromMap = map[id];

  let assetId = null;
  let productKind = meta.productKind;

  if (fromMap != null) {
    if (typeof fromMap === "object") {
      assetId = fromMap.id || fromMap.assetId || fromMap.gamePassId || null;
      if (fromMap.type || fromMap.kind) {
        productKind = String(fromMap.type || fromMap.kind);
      }
    } else {
      assetId = fromMap;
    }
  }

  if (!assetId) {
    for (const envKey of meta.envKeys) {
      const v = process.env[envKey];
      if (v && String(v).trim()) {
        assetId = String(v).trim();
        break;
      }
    }
  }

  if (!assetId) return null;

  const kindNorm =
    String(productKind).toLowerCase() === "gamepass" ? "GamePass" : "Asset";

  return {
    plan: id,
    name: meta.name,
    days: meta.days,
    price: Number(process.env[`ROBLOX_PRICE_${id.toUpperCase()}`]) || meta.price,
    unit: meta.unit,
    blurb: meta.blurb,
    assetId: String(assetId),
    productKind: kindNorm,
    buyUrl: catalogUrl(assetId, kindNorm),
    configured: true,
  };
}

function listProducts() {
  const order = ["week", "month", "lifetime", "premium"];
  const products = [];
  for (const id of order) {
    const p = resolveProduct(id);
    if (p) products.push(p);
  }
  // Always expose plan placeholders when none configured (demo UX)
  if (products.length === 0) {
    for (const id of ["week", "month", "lifetime"]) {
      const meta = PLAN_META[id];
      products.push({
        plan: id,
        name: meta.name,
        days: meta.days,
        price: meta.price,
        unit: meta.unit,
        blurb: meta.blurb,
        assetId: null,
        productKind: meta.productKind,
        buyUrl: null,
        configured: false,
      });
    }
  }
  return products;
}

function isDemoMode() {
  const v = String(process.env.DEMO_ROBLOX || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function cookieHeader() {
  const cookie = process.env.ROBLOX_COOKIE || process.env.ROBLOSECURITY || "";
  if (!cookie) return null;
  const trimmed = String(cookie).trim();
  if (trimmed.toLowerCase().startsWith(".roblosecurity=")) {
    return trimmed;
  }
  return `.ROBLOSECURITY=${trimmed}`;
}

async function robloxFetch(url, opts = {}) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "OXIDE-Gate-API/1.0",
    ...(opts.headers || {}),
  };
  const cookie = cookieHeader();
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(url, { ...opts, headers });
  return res;
}

/**
 * Resolve Roblox username → userId via public Users API.
 */
async function resolveUserId(username) {
  const name = String(username || "").trim();
  if (!name) {
    return { ok: false, error: "missing_username", message: "Enter your Roblox username." };
  }

  const res = await robloxFetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [name], excludeBannedUsers: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[roblox] username resolve failed", res.status, text.slice(0, 200));
    return {
      ok: false,
      error: "roblox_lookup_failed",
      message: "Could not look up that Roblox username. Try again in a moment.",
    };
  }

  const data = await res.json();
  const entry = Array.isArray(data?.data) ? data.data[0] : null;
  if (!entry || entry.id == null) {
    return {
      ok: false,
      error: "user_not_found",
      message: "Roblox user not found. Check the username spelling.",
    };
  }

  return {
    ok: true,
    userId: String(entry.id),
    username: entry.name || name,
    displayName: entry.displayName || entry.name || name,
  };
}

/**
 * Check ownership of a classic Asset (shirt / t-shirt / pants) or GamePass.
 * Prefer inventory.roblox.com; fall back to economy ownership endpoint.
 */
async function checkOwnership({ userId, assetId, productKind }) {
  if (isDemoMode()) {
    return { ok: true, owned: true, demo: true };
  }

  const kind = String(productKind).toLowerCase() === "gamepass" ? "GamePass" : "Asset";
  const uid = encodeURIComponent(String(userId));
  const aid = encodeURIComponent(String(assetId));

  const candidates = [
    `https://inventory.roblox.com/v1/users/${uid}/items/${kind}/${aid}`,
    `https://inventory.roblox.com/v2/users/${uid}/items/${kind}/${aid}`,
    kind === "Asset"
      ? `https://economy.roblox.com/v1/users/${uid}/items/Asset/${aid}`
      : null,
  ].filter(Boolean);

  let lastStatus = null;
  let lastBody = "";

  for (const url of candidates) {
    try {
      const res = await robloxFetch(url);
      lastStatus = res.status;
      const text = await res.text();
      lastBody = text.slice(0, 300);

      if (res.status === 404) {
        // Endpoint not found — try next
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: "roblox_auth_required",
          message:
            "Roblox blocked the ownership check. Set ROBLOX_COOKIE (.ROBLOSECURITY) on the API, or enable DEMO_ROBLOX=1 for testing.",
          status: res.status,
        };
      }

      if (!res.ok) {
        continue;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        continue;
      }

      // Shape A: { data: [ items ] }
      if (Array.isArray(data?.data)) {
        return { ok: true, owned: data.data.length > 0, demo: false };
      }
      // Shape B: boolean
      if (typeof data === "boolean") {
        return { ok: true, owned: data, demo: false };
      }
      // Shape C: { owned: true }
      if (typeof data?.owned === "boolean") {
        return { ok: true, owned: data.owned, demo: false };
      }
      // Shape D: non-empty object with id
      if (data && (data.id != null || data.assetId != null || data.Id != null)) {
        return { ok: true, owned: true, demo: false };
      }
    } catch (err) {
      console.error("[roblox] ownership fetch error", url, err.message);
    }
  }

  // GamePass alternate: legacy ownership endpoint
  if (kind === "GamePass") {
    try {
      const url = `https://inventory.roblox.com/v1/users/${uid}/items/GamePass/${aid}`;
      const res = await robloxFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.data)) {
          return { ok: true, owned: data.data.length > 0, demo: false };
        }
      }
    } catch (_) {
      /* fall through */
    }
  }

  console.error("[roblox] ownership check exhausted", { userId, assetId, kind, lastStatus, lastBody });
  return {
    ok: false,
    error: "ownership_check_failed",
    message:
      "Could not verify Roblox ownership. Ensure the asset ID is correct, inventories are public, or set ROBLOX_COOKIE.",
  };
}

module.exports = {
  PLAN_META,
  listProducts,
  resolveProduct,
  resolveUserId,
  checkOwnership,
  isDemoMode,
  catalogUrl,
};
