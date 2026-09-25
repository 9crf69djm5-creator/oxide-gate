"use strict";

const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const { readJson, writeJson } = require("./store");
const { findChannel } = require("./setup");

const STORE_FILE = "roblox-version.json";
const DEFAULT_STORE = {
  version: null,
  clientVersionUpload: null,
  detectedAt: null,
  messageId: null,
  channelId: null,
};

const ENDPOINTS = [
  "https://clientsettingscdn.roblox.com/v2/client-version/WindowsPlayer",
  "https://clientsettings.roblox.com/v2/client-version/WindowsPlayer",
];

/**
 * Best-effort read of Offsets::ClientVersion from local offsets.h
 */
function readLocalClientVersion() {
  const candidates = [
    path.join(__dirname, "..", "..", "External", "src", "sdk", "offsets.h"),
    path.join(__dirname, "..", "..", "..", "External", "src", "sdk", "offsets.h"),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      const m = text.match(/ClientVersion\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * @returns {Promise<{ version: string, clientVersionUpload?: string, source: string }>}
 */
async function fetchRobloxWindowsVersion() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const version =
        data.clientVersionUpload ||
        data.version ||
        data.versionGuid ||
        null;
      if (!version) throw new Error("No version field in response");
      // Prefer version-XXXXXXXX style when available
      let display = version;
      if (typeof data.version === "string" && data.version.startsWith("version-")) {
        display = data.version;
      } else if (!String(display).startsWith("version-")) {
        display = `version-${display}`;
      }
      return {
        version: display,
        clientVersionUpload: data.clientVersionUpload || version,
        source: url,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Roblox version endpoints failed");
}

function downloadInfo(versionHash) {
  const hash = String(versionHash).replace(/^version-/, "");
  return {
    cdnVersionUrl: `https://setup.rbxcdn.com/version-${hash}`,
    playerZipHint: `https://setup.rbxcdn.com/version-${hash}-RobloxApp.zip`,
    note: "CDN paths vary by channel; use clientsettings version as source of truth.",
  };
}

/**
 * @param {object} opts
 * @param {string} opts.version
 * @param {string} [opts.clientVersionUpload]
 * @param {string} [opts.previous]
 * @param {boolean} opts.changed
 * @param {string} [opts.localBuild]
 * @param {string} [opts.source]
 */
function buildEmbed(opts) {
  const detected = new Date().toISOString();
  const dl = downloadInfo(opts.version);
  const embed = new EmbedBuilder()
    .setTitle("Roblox Windows Client")
    .setColor(opts.changed ? 0xe6852e : 0x5dade2)
    .setDescription(
      opts.changed
        ? "**New version detected** — offsets may need an update."
        : "Current WindowsPlayer client version (unchanged)."
    )
    .addFields(
      { name: "Version", value: `\`${opts.version}\``, inline: false },
      {
        name: "Upload / GUID",
        value: `\`${opts.clientVersionUpload || "—"}\``,
        inline: true,
      },
      {
        name: "Detected",
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true,
      },
      {
        name: "Download / CDN",
        value: `[version index](${dl.cdnVersionUrl})\n\`${dl.playerZipHint}\`\n_${dl.note}_`,
        inline: false,
      }
    )
    .setFooter({ text: "OXIDE · Roblox version intel" })
    .setTimestamp(new Date(detected));

  if (opts.previous && opts.changed) {
    embed.addFields({
      name: "Previous",
      value: `\`${opts.previous}\``,
      inline: false,
    });
  }
  if (opts.localBuild) {
    const match = opts.localBuild === opts.version;
    embed.addFields({
      name: "Local offsets.h",
      value: `\`${opts.localBuild}\` ${match ? "(matches)" : "(**differs** — update offsets)"}`,
      inline: false,
    });
  }
  if (opts.source) {
    embed.addFields({ name: "Source", value: opts.source, inline: false });
  }
  return embed;
}

/**
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {object} store
 * @param {boolean} announceChange
 */
async function postOrEdit(channel, embed, store, announceChange, newVersion) {
  if (store.messageId && store.channelId === channel.id) {
    try {
      const msg = await channel.messages.fetch(store.messageId);
      await msg.edit({ embeds: [embed] });
      if (announceChange && newVersion) {
        await channel.send({
          content: `**Roblox updated** → \`${newVersion}\``,
        });
      }
      return store.messageId;
    } catch {
      /* fall through to send */
    }
  }
  const sent = await channel.send({ embeds: [embed] });
  if (announceChange && newVersion && store.messageId) {
    await channel.send({
      content: `**Roblox updated** → \`${newVersion}\``,
    });
  }
  return sent.id;
}

/**
 * Fetch version, update store + #roblox-versions.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {{ forceAnnounce?: boolean }} [opts]
 */
async function syncRobloxVersion(client, guildId, opts = {}) {
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  const channel = findChannel(guild, "roblox-versions");
  if (!channel || !channel.isTextBased()) {
    throw new Error("#roblox-versions not found — run /setup first");
  }

  const remote = await fetchRobloxWindowsVersion();
  const store = readJson(STORE_FILE, DEFAULT_STORE);
  const previous = store.version;
  const changed = Boolean(previous) && previous !== remote.version;
  const first = !previous;
  const localBuild = readLocalClientVersion();

  const embed = buildEmbed({
    version: remote.version,
    clientVersionUpload: remote.clientVersionUpload,
    previous,
    changed: changed || first,
    localBuild,
    source: remote.source,
  });

  const announce = opts.forceAnnounce || changed;
  const messageId = await postOrEdit(
    channel,
    embed,
    store,
    announce && changed,
    remote.version
  );

  const next = {
    version: remote.version,
    clientVersionUpload: remote.clientVersionUpload || null,
    detectedAt: new Date().toISOString(),
    messageId,
    channelId: channel.id,
  };
  writeJson(STORE_FILE, next);

  return {
    ...next,
    changed,
    first,
    previous,
    localBuild,
    embed,
  };
}

module.exports = {
  fetchRobloxWindowsVersion,
  syncRobloxVersion,
  buildEmbed,
  readLocalClientVersion,
};
