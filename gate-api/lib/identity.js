"use strict";

/**
 * Durable Discord ↔ Roblox identity links for license recovery.
 */
const dbModule = require("./db");
const keys = require("./keys");
const roblox = require("./roblox");

function getDb() {
  return dbModule.db;
}

function nowIso() {
  return new Date().toISOString();
}

function getLinkByDiscord(discordUserId) {
  const id = keys.normalizeDiscordUserId(discordUserId);
  if (!id) return null;
  return getDb()
    .prepare("SELECT * FROM discord_roblox_links WHERE discord_user_id = ?")
    .get(id);
}

function getLinkByRobloxUserId(robloxUserId) {
  const id = String(robloxUserId || "").trim();
  if (!id) return null;
  return getDb()
    .prepare("SELECT * FROM discord_roblox_links WHERE roblox_user_id = ?")
    .get(id);
}

/**
 * Link a Discord user to a Roblox account (resolved by username).
 * Also attaches discord_user_id to any keys already claimed by that Roblox user.
 */
async function linkDiscordToRoblox({ discordUserId, robloxUsername }) {
  const discordId = keys.normalizeDiscordUserId(discordUserId);
  if (!discordId) {
    return { ok: false, error: "invalid_discord", message: "Invalid Discord user id." };
  }

  const user = await roblox.resolveUserId(robloxUsername);
  if (!user.ok) return user;

  getDb()
    .prepare(
      `
      INSERT INTO discord_roblox_links
        (discord_user_id, roblox_user_id, roblox_username, linked_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(discord_user_id) DO UPDATE SET
        roblox_user_id = excluded.roblox_user_id,
        roblox_username = excluded.roblox_username,
        linked_at = excluded.linked_at
    `
    )
    .run(discordId, String(user.userId), user.username, nowIso());

  // One Roblox account → one Discord link (clear other Discord rows for same Roblox)
  getDb()
    .prepare(
      `
      DELETE FROM discord_roblox_links
      WHERE roblox_user_id = ? AND discord_user_id != ?
    `
    )
    .run(String(user.userId), discordId);

  const attached = keys.attachDiscordToRobloxKeys({
    robloxUserId: user.userId,
    discordUserId: discordId,
    robloxUsername: user.username,
  });

  return {
    ok: true,
    discordUserId: discordId,
    robloxUserId: String(user.userId),
    robloxUsername: user.username,
    keysLinked: attached.count,
    keys: attached.keys,
    message:
      attached.count > 0
        ? `Linked @${user.username} to Discord and recovered ${attached.count} license(s).`
        : `Linked @${user.username} to Discord. Claim or /redeem a key next — claims will auto-attach.`,
  };
}

/**
 * Recover licenses for a Discord user: by discord_user_id on keys, else via Roblox link.
 */
function recoverForDiscord(discordUserId) {
  const discordId = keys.normalizeDiscordUserId(discordUserId);
  if (!discordId) {
    return { ok: false, error: "invalid_discord", message: "Invalid Discord user id." };
  }

  const byDiscord = keys.licenseForDiscord(discordId);
  if (byDiscord.ok || byDiscord.error === "expired" || byDiscord.error === "banned") {
    return { ...byDiscord, recoveryPath: "discord" };
  }

  const link = getLinkByDiscord(discordId);
  if (!link) {
    return {
      ok: false,
      error: "not_linked",
      message:
        "No license linked yet. Claim on the site, then /link-roblox <username> or /redeem with your key.",
    };
  }

  const attached = keys.attachDiscordToRobloxKeys({
    robloxUserId: link.roblox_user_id,
    discordUserId: discordId,
    robloxUsername: link.roblox_username,
  });

  if (attached.count === 0) {
    return {
      ok: false,
      error: "no_keys_for_roblox",
      robloxUsername: link.roblox_username,
      robloxUserId: link.roblox_user_id,
      message: `Roblox @${link.roblox_username} is linked, but no OXIDE key is claimed yet. Buy + claim on the site, or /redeem a key you already have.`,
    };
  }

  const license = keys.licenseForDiscord(discordId);
  return {
    ...license,
    recoveryPath: "roblox_link",
    robloxUsername: link.roblox_username,
    robloxUserId: link.roblox_user_id,
    keysLinked: attached.count,
  };
}

/**
 * Admin / staff: look up license(s) by Roblox username.
 */
async function recoverByRobloxUsername(rawUsername) {
  const user = await roblox.resolveUserId(rawUsername);
  if (!user.ok) return user;

  const rows = keys.listKeysForRobloxUserId(user.userId);
  if (!rows.length) {
    // Fall back to claims table (older rows before keys.roblox_* columns)
    const claims = getDb()
      .prepare(
        `
        SELECT key, plan, claimed_at, roblox_user_id, roblox_username
        FROM roblox_claims
        WHERE roblox_user_id = ?
        ORDER BY claimed_at DESC
      `
      )
      .all(String(user.userId));

    if (!claims.length) {
      return {
        ok: false,
        error: "not_found",
        robloxUsername: user.username,
        robloxUserId: String(user.userId),
        message: `No claimed keys for @${user.username}.`,
      };
    }

    for (const c of claims) {
      keys.attachRoblox(c.key, {
        robloxUserId: user.userId,
        robloxUsername: user.username,
      });
    }
  }

  const licenses = keys.listKeysForRobloxUserId(user.userId).map((row) =>
    keys.formatLicense(row, { includeFullKey: true })
  );
  const link = getLinkByRobloxUserId(user.userId);

  return {
    ok: true,
    robloxUsername: user.username,
    robloxUserId: String(user.userId),
    discordUserId: link?.discord_user_id || licenses[0]?.discordUserId || null,
    count: licenses.length,
    licenses,
    primary: licenses[0] || null,
  };
}

module.exports = {
  getLinkByDiscord,
  getLinkByRobloxUserId,
  linkDiscordToRoblox,
  recoverForDiscord,
  recoverByRobloxUsername,
};
