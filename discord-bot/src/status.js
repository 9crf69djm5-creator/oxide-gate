"use strict";

const { EmbedBuilder, ChannelType } = require("discord.js");
const { fetchHealth, fetchProducts, probeDownload } = require("./gate");
const { findChannel, CHANNELS } = require("./setup");
const { config } = require("./config");

const DEFAULT_DOWNLOAD =
  "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

/**
 * Collect live status for embeds / #status channel.
 */
async function collectStatusSnapshot() {
  const apiBase = config.apiBaseUrl;
  const downloadUrl =
    `${apiBase}/downloads/Oxide.exe` || DEFAULT_DOWNLOAD;
  const botHealth =
    process.env.BOT_HEALTH_URL ||
    "https://oxide-discord-bot-fra.onrender.com/";

  const [health, products, download] = await Promise.all([
    fetchHealth(apiBase).catch((err) => ({
      ok: false,
      status: 0,
      ms: 0,
      body: null,
      url: `${apiBase}/api/health`,
      error: err.message,
    })),
    fetchProducts(apiBase).catch((err) => ({
      ok: false,
      status: 0,
      ms: 0,
      body: null,
      error: err.message,
    })),
    probeDownload(downloadUrl),
  ]);

  let bot = { ok: false, status: 0, ms: 0, body: null };
  try {
    const started = Date.now();
    const res = await fetch(botHealth, {
      headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    bot = {
      ok: res.ok && (body?.ok === true || body?.ready === true || body?.service),
      status: res.status,
      ms: Date.now() - started,
      body,
      ready: body?.ready,
    };
  } catch (err) {
    bot = { ok: false, status: 0, ms: 0, body: null, error: err.message };
  }

  const configured =
    products.body?.products?.filter((p) => p.configured).length ?? 0;
  const total = products.body?.products?.length ?? 0;

  return {
    health,
    products,
    download,
    bot,
    configured,
    total,
    downloadUrl,
    checkedAt: new Date(),
  };
}

/**
 * @param {Awaited<ReturnType<typeof collectStatusSnapshot>>} snap
 */
function buildStatusEmbed(snap) {
  const allOk =
    snap.health.ok && snap.download.ok && snap.products.ok && snap.configured > 0;
  const color = allOk ? 0x2ecc71 : snap.health.ok ? 0xe6852e : 0xe74c3c;

  const line = (ok, label, extra) =>
    `${ok ? "✅" : "❌"} **${label}**${extra ? ` — ${extra}` : ""}`;

  return new EmbedBuilder()
    .setTitle("OXIDE system status")
    .setColor(color)
    .setDescription(
      [
        line(
          snap.health.ok,
          "Gate API",
          snap.health.ok
            ? `${snap.health.ms}ms · db ${snap.health.body?.dbEphemeral ? "ephemeral!" : "ok"}`
            : snap.health.error || `HTTP ${snap.health.status}`
        ),
        line(
          snap.download.ok,
          "Downloads",
          snap.download.ok
            ? `Oxide.exe · ${snap.download.ms}ms`
            : snap.download.error || `HTTP ${snap.download.status}`
        ),
        line(
          snap.products.ok && snap.configured > 0,
          "Products / gamepasses",
          snap.products.ok
            ? `${snap.configured}/${snap.total} configured${snap.products.body?.demo ? " · DEMO" : ""}`
            : snap.products.error || `HTTP ${snap.products.status}`
        ),
        line(
          snap.bot.ok,
          "Discord bot",
          snap.bot.ok
            ? `${snap.bot.body?.user || "ready"} · ${snap.bot.ms}ms`
            : snap.bot.error || "unreachable"
        ),
      ].join("\n")
    )
    .addFields(
      {
        name: "Site",
        value: config.siteUrl,
        inline: true,
      },
      {
        name: "API",
        value: `\`${config.apiBaseUrl}\``,
        inline: true,
      }
    )
    .setTimestamp(snap.checkedAt)
    .setFooter({ text: "Auto-updated · /status for a live ping" });
}

/**
 * Post or edit the pinned-style status message in #status.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 */
async function syncStatusChannel(client, guildId) {
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  const ch = findChannel(guild, CHANNELS.status, ChannelType.GuildText);
  if (!ch?.isTextBased()) {
    throw new Error("#status channel not found — run /setup-server");
  }

  const snap = await collectStatusSnapshot();
  const embed = buildStatusEmbed(snap);

  const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
  const existing =
    recent &&
    [...recent.values()].find(
      (m) =>
        m.author?.id === client.user.id &&
        /system status/i.test(m.embeds?.[0]?.title || "")
    );

  if (existing) {
    await existing.edit({ embeds: [embed] });
    return { updated: true, snap };
  }
  await ch.send({ embeds: [embed] });
  return { updated: false, created: true, snap };
}

module.exports = {
  collectStatusSnapshot,
  buildStatusEmbed,
  syncStatusChannel,
};
