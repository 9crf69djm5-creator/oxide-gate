const { db } = require("./db");
const keys = require("./keys");
const roblox = require("./roblox");

function nowIso() {
  return new Date().toISOString();
}

function getClaim(robloxUserId, assetId) {
  return db
    .prepare(
      "SELECT * FROM roblox_claims WHERE roblox_user_id = ? AND asset_id = ?"
    )
    .get(String(robloxUserId), String(assetId));
}

function insertClaim(row) {
  db.prepare(
    `
    INSERT INTO roblox_claims
      (roblox_user_id, roblox_username, asset_id, asset_type, plan, key, claimed_at)
    VALUES
      (@roblox_user_id, @roblox_username, @asset_id, @asset_type, @plan, @key, @claimed_at)
  `
  ).run(row);
}

/**
 * Claim an OXIDE key after verifying Roblox ownership of the mapped product.
 * One (robloxUserId, assetId) pair → one key forever.
 */
async function claimKey({ username, plan }) {
  const planId = String(plan || "").toLowerCase().trim();
  if (!planId) {
    return { ok: false, error: "missing_plan", message: "Choose a plan (week, month, or lifetime)." };
  }

  const product = roblox.resolveProduct(planId);
  if (!product || !product.assetId) {
    return {
      ok: false,
      error: "product_not_configured",
      message:
        "This Roblox product is not configured yet. Set ROBLOX_ASSET_WEEK / ROBLOX_ASSET_MONTH / ROBLOX_GAMEPASS_LIFETIME on the API.",
    };
  }

  const user = await roblox.resolveUserId(username);
  if (!user.ok) return user;

  const existing = getClaim(user.userId, product.assetId);
  if (existing) {
    const keyRow = keys.getKey(existing.key);
    return {
      ok: true,
      alreadyClaimed: true,
      key: existing.key,
      plan: keys.planLabel(existing.plan),
      planId: existing.plan,
      days: keyRow?.duration_days ?? product.days,
      robloxUserId: user.userId,
      robloxUsername: user.username,
      assetId: product.assetId,
      productKind: product.productKind,
      buyUrl: product.buyUrl,
      message: "You already claimed a key for this Roblox purchase.",
      demo: roblox.isDemoMode(),
    };
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
      message: `We could not find that ${product.productKind === "GamePass" ? "gamepass" : "shirt"} on your Roblox account. Buy it first, wait a few seconds, then claim again.`,
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
    return { ok: false, error: "key_create_failed", message: "Could not create a license key." };
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
    // Race: another claim landed first — return that key
    if (err && String(err.code || "").includes("CONSTRAINT")) {
      const raced = getClaim(user.userId, product.assetId);
      if (raced) {
        return {
          ok: true,
          alreadyClaimed: true,
          key: raced.key,
          plan: keys.planLabel(raced.plan),
          planId: raced.plan,
          days: product.days,
          robloxUserId: user.userId,
          robloxUsername: user.username,
          assetId: product.assetId,
          productKind: product.productKind,
          buyUrl: product.buyUrl,
          message: "You already claimed a key for this Roblox purchase.",
          demo: ownership.demo || false,
        };
      }
    }
    throw err;
  }

  return {
    ok: true,
    alreadyClaimed: false,
    key: keyInfo.key,
    plan: keys.planLabel(product.plan),
    planId: product.plan,
    days: product.days,
    robloxUserId: user.userId,
    robloxUsername: user.username,
    assetId: product.assetId,
    productKind: product.productKind,
    buyUrl: product.buyUrl,
    message: "Purchase verified. Your OXIDE key is ready — redeem it on Get a key.",
    demo: ownership.demo || false,
  };
}

module.exports = {
  claimKey,
  getClaim,
  listProducts: roblox.listProducts,
};
