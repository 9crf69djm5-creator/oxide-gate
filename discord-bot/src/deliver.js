"use strict";

/**
 * Shared helpers to DM a user their license key (claim notify + commands).
 */
const { brandEmbed, linkRow } = require("./brand");
const { config } = require("./config");

function formatExpires(expires) {
  if (!expires) return "Lifetime";
  const t = Date.parse(expires);
  if (!Number.isFinite(t)) return String(expires);
  const s = Math.floor(t / 1000);
  return `<t:${s}:D> (<t:${s}:R>)`;
}

function maskKey(key) {
  const k = String(key || "");
  const parts = k.split("-");
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1]}-••••-••••`;
  }
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 8)}…••••`;
}

/**
 * @param {import('discord.js').Client} client
 * @param {object} payload
 */
async function deliverKeyDm(client, payload) {
  const {
    discordUserId,
    key,
    plan,
    expires,
    robloxUsername,
    alreadyClaimed,
    downloadUrl,
  } = payload || {};

  if (!discordUserId || !key) {
    return { ok: false, error: "missing_fields" };
  }

  let user;
  try {
    user = await client.users.fetch(String(discordUserId));
  } catch (err) {
    return { ok: false, error: "user_fetch", message: err.message };
  }

  const dl =
    downloadUrl ||
    "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

  const embed = brandEmbed({
    title: alreadyClaimed ? "Your OXIDE key (recovered)" : "Your OXIDE key is ready",
    footer: "Keep this key private — staff will never ask for it.",
    description:
      "**Saved forever** under your Roblox" +
      (robloxUsername ? ` (\`@${robloxUsername}\`)` : "") +
      " and this Discord.\n" +
      "Paste the key into **Oxide.exe**. Recover anytime with `/mykey` or `/recover`.",
  }).addFields(
    { name: "Key", value: `\`${key}\``, inline: false },
    { name: "Plan", value: plan || "—", inline: true },
    { name: "Expires", value: formatExpires(expires), inline: true },
    { name: "Download", value: `[Oxide.exe](${dl})`, inline: false }
  );
  const row = linkRow([
    ["Download Oxide.exe", dl],
    ["Changelog", `${config.siteUrl}/changelog`],
  ]);

  try {
    await user.send({ embeds: [embed], components: [row] });
    return { ok: true, delivered: "dm", masked: maskKey(key) };
  } catch (err) {
    return {
      ok: false,
      error: "dm_closed",
      message: err.message,
      masked: maskKey(key),
    };
  }
}

module.exports = { deliverKeyDm, maskKey };
