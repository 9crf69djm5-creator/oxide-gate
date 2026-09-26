"use strict";

/**
 * Shared helpers to DM a user their license key (claim notify + commands).
 */
const { EmbedBuilder } = require("discord.js");

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

  const embed = new EmbedBuilder()
    .setTitle(
      alreadyClaimed ? "Your OXIDE key (recovered)" : "Your OXIDE key is ready"
    )
    .setColor(0xe6852e)
    .setDescription(
      "**Saved forever** under your Roblox" +
        (robloxUsername ? ` (\`@${robloxUsername}\`)` : "") +
        " and this Discord.\n" +
        "Paste the key into **Oxide.exe**. Recover anytime with `/mykey` or `/recover`."
    )
    .addFields(
      { name: "Key", value: `\`${key}\``, inline: false },
      { name: "Plan", value: plan || "—", inline: true },
      {
        name: "Expires",
        value: expires ? String(expires) : "Lifetime",
        inline: true,
      },
      { name: "Download", value: `[Oxide.exe](${dl})`, inline: false }
    )
    .setFooter({ text: "Keep this key private." });

  try {
    await user.send({ embeds: [embed] });
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
