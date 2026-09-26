"use strict";

const dbModule = require("./db");
const keys = require("./keys");
const roblox = require("./roblox");
const identity = require("./identity");

function getDb() {
  return dbModule.db;
}

function nowIso() {
  return new Date().toISOString();
}

function getClaim(robloxUserId, assetId) {
  return getDb()
    .prepare(
      "SELECT * FROM roblox_claims WHERE roblox_user_id = ? AND asset_id = ?"
    )
    .get(String(robloxUserId), String(assetId));
}

function insertClaim(row) {
  getDb()
    .prepare(
      `
    INSERT INTO roblox_claims
      (roblox_user_id, roblox_username, asset_id, asset_type, plan, key, claimed_at)
    VALUES
      (@roblox_user_id, @roblox_username, @asset_id, @asset_type, @plan, @key, @claimed_at)
  `
    )
    .run(row);
}

/**
 * Best-effort DM via Discord bot internal endpoint.
 */
async function notifyDiscordKeyDelivery(payload) {
  const base = String(
    process.env.DISCORD_BOT_NOTIFY_URL ||
      process.env.DISCORD_BOT_HEALTH_URL ||
      "https://oxide-discord-bot-fra.onrender.com"
  )
    .trim()
    .replace(/\/$/, "");
  const secret = String(process.env.ADMIN_SECRET || "").trim();
  if (!base || !secret || !payload?.discordUserId || !payload?.key) {
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch(`${base}/internal/deliver-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Admin-Secret": secret,
        "User-Agent": "OXIDE-GateAPI/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body.ok !== false, status: res.status, body };
  } catch (err) {
    console.warn("[claim] Discord notify failed:", err.message);
    return { ok: false, error: err.message };
  }
}

function enrichClaimResult({
  key,
  planId,
  days,
  user,
  product,
  alreadyClaimed,
  demo,
  message,
}) {
  keys.attachRoblox(key, {
    robloxUserId: user.userId,
    robloxUsername: user.username,
  });

  const link = identity.getLinkByRobloxUserId(user.userId);
  let discordUserId = link?.discord_user_id || null;
  let discordLinked = false;
  let discordDm = null;

  if (discordUserId) {
    const attached = keys.attachDiscordToRobloxKeys({
      robloxUserId: user.userId,
      discordUserId,
      robloxUsername: user.username,
    });
    discordLinked = attached.count > 0 || Boolean(keys.getKey(key)?.discord_user_id);
  } else {
    // Key may already have discord from a prior /redeem
    discordUserId = keys.getKey(key)?.discord_user_id || null;
    discordLinked = Boolean(discordUserId);
  }

  const license = keys.formatLicense(keys.getKey(key), { includeFullKey: true });

  return {
    ok: true,
    alreadyClaimed: Boolean(alreadyClaimed),
    key,
    plan: keys.planLabel(planId),
    planId,
    days: days ?? product.days,
    expires: license?.expires ?? null,
    status: license?.status || "unused",
    remainingLabel: license?.remainingLabel || null,
    robloxUserId: String(user.userId),
    robloxUsername: user.username,
    assetId: product.assetId,
    productKind: product.productKind,
    buyUrl: product.buyUrl,
    discordUserId,
    discordLinked,
    discordDm,
    savedForever: true,
    downloadUrl: license?.downloadUrl || null,
    message:
      message ||
      (discordLinked
        ? "Purchase verified. Key saved under your Roblox + Discord — check Discord DMs / /mykey."
        : "Purchase verified. Key saved forever under your Roblox username. Link Discord with /link-roblox or /redeem."),
    demo: Boolean(demo),
  };
}

/**
 * Claim an OXIDE key after verifying Roblox ownership of the mapped product.
 * One (robloxUserId, assetId) pair → one key forever.
 * Stamps roblox_* on the key and auto-attaches Discord when linked.
 */
async function claimKey({ username, plan }) {
  const planId = String(plan || "").toLowerCase().trim();
  if (!planId) {
    return {
      ok: false,
      error: "missing_plan",
      message: "Choose a plan (week, month, or lifetime).",
    };
  }

  const product = roblox.resolveProduct(planId);
  if (!product || !product.assetId) {
    return {
      ok: false,
      error: "product_not_configured",
      message:
        "This Roblox product is not configured yet. Set ROBLOX_GAMEPASS_WEEK / ROBLOX_GAMEPASS_MONTH / ROBLOX_GAMEPASS_LIFETIME (or shirt ROBLOX_ASSET_*) on the API.",
    };
  }

  const user = await roblox.resolveUserId(username);
  if (!user.ok) return user;

  const existing = getClaim(user.userId, product.assetId);
  if (existing) {
    const keyRow = keys.getKey(existing.key);
    const result = enrichClaimResult({
      key: existing.key,
      planId: existing.plan,
      days: keyRow?.duration_days ?? product.days,
      user,
      product,
      alreadyClaimed: true,
      demo: roblox.isDemoMode(),
      message: "Already claimed — here’s your saved key (linked to this Roblox username forever).",
    });
    if (result.discordUserId) {
      result.discordDm = await notifyDiscordKeyDelivery({
        discordUserId: result.discordUserId,
        key: result.key,
        plan: result.plan,
        planId: result.planId,
        expires: result.expires,
        robloxUsername: result.robloxUsername,
        alreadyClaimed: true,
      });
    }
    return result;
  }

  const ownership = await roblox.checkOwnership({
    userId: user.userId,
    assetId: product.assetId,
    productKind: product.productKind,
  });

  if (!ownership.ok) return ownership;

  if (!ownership.owned) {
    return {
      ok: false,
      error: "not_owned",
      message: `We could not find that ${
        product.productKind === "GamePass" ? "gamepass" : "shirt"
      } on your Roblox account. Buy it first, wait a few seconds, then claim again.`,
      buyUrl: product.buyUrl,
      assetId: product.assetId,
    };
  }

  const created = keys.createKeys({
    plan: product.plan,
    count: 1,
    days: product.days,
  });
  const keyInfo = created.keys[0];
  if (!keyInfo) {
    return {
      ok: false,
      error: "key_create_failed",
      message: "Could not create a license key.",
    };
  }

  try {
    insertClaim({
      roblox_user_id: user.userId,
      roblox_username: user.username,
      asset_id: product.assetId,
      asset_type: product.productKind,
      plan: product.plan,
      key: keyInfo.key,
      claimed_at: nowIso(),
    });
  } catch (err) {
    if (err && String(err.code || "").includes("CONSTRAINT")) {
      const raced = getClaim(user.userId, product.assetId);
      if (raced) {
        const result = enrichClaimResult({
          key: raced.key,
          planId: raced.plan,
          days: product.days,
          user,
          product,
          alreadyClaimed: true,
          demo: ownership.demo || false,
          message: "Already claimed — here’s your saved key.",
        });
        if (result.discordUserId) {
          result.discordDm = await notifyDiscordKeyDelivery({
            discordUserId: result.discordUserId,
            key: result.key,
            plan: result.plan,
            planId: result.planId,
            expires: result.expires,
            robloxUsername: result.robloxUsername,
            alreadyClaimed: true,
          });
        }
        return result;
      }
    }
    throw err;
  }

  const result = enrichClaimResult({
    key: keyInfo.key,
    planId: product.plan,
    days: product.days,
    user,
    product,
    alreadyClaimed: false,
    demo: ownership.demo || false,
  });

  if (result.discordUserId) {
    result.discordDm = await notifyDiscordKeyDelivery({
      discordUserId: result.discordUserId,
      key: result.key,
      plan: result.plan,
      planId: result.planId,
      expires: result.expires,
      robloxUsername: result.robloxUsername,
      alreadyClaimed: false,
    });
  }

  return result;
}

module.exports = {
  claimKey,
  getClaim,
  listProducts: roblox.listProducts,
  notifyDiscordKeyDelivery,
};
