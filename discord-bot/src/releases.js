"use strict";

const crypto = require("crypto");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  AttachmentBuilder,
} = require("discord.js");
const { config } = require("./config");
const { readJson, writeJson } = require("./store");
const { findChannel, CHANNELS } = require("./setup");

const STORE_FILE = "release-announce.json";
/** Footer marker — the announcement channel itself is the durable "already posted" record. */
const FOOTER_PREFIX = "OXIDE release v";

/** Stay well under Discord's default 10 MB bot upload limit. */
const MAX_ATTACH_BYTES = 9.5 * 1024 * 1024;

let announceChain = Promise.resolve();
/** @type {{ version: string, sha256: string, buffer: Buffer } | null} */
let exeCache = null;

async function fetchJson(pathname) {
  const url = `${config.apiBaseUrl}${pathname}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "OXIDE-DiscordBot/1.0" },
    signal: AbortSignal.timeout(45000),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok && body?.ok !== false, status: res.status, body, url };
}

/** @returns {Promise<object|null>} */
async function fetchLatestRelease() {
  const r = await fetchJson("/api/releases/latest");
  return r.ok ? r.body.release || null : null;
}

/** @returns {Promise<object[]>} */
async function fetchReleases() {
  const r = await fetchJson("/api/releases");
  return r.ok ? r.body.releases || [] : [];
}

/**
 * Download the hosted Oxide.exe for a release and verify it against the release SHA256.
 * Returns null (with a logged reason) instead of throwing, so callers can fall back to links.
 * @param {object} release from /api/releases/latest
 * @returns {Promise<AttachmentBuilder|null>}
 */
async function fetchReleaseAttachment(release) {
  const want = String(release?.sha256 || "").toLowerCase();
  if (!want) {
    console.warn(`[release] no sha256 for v${release?.version} — not attaching EXE`);
    return null;
  }
  const toAttachment = (buffer) =>
    new AttachmentBuilder(buffer, {
      name: "Oxide.exe",
      description: `Oxide v${release.version} · sha256 ${want.slice(0, 12)}`,
    });
  if (exeCache && exeCache.version === release.version && exeCache.sha256 === want) {
    return toAttachment(exeCache.buffer);
  }

  const urls = [release.downloadUrl, release.siteDownloadUrl].filter(Boolean);
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "OXIDE-DiscordBot/1.0", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_ATTACH_BYTES) throw new Error(`too large (${buffer.length} bytes)`);
      const got = crypto.createHash("sha256").update(buffer).digest("hex");
      if (got !== want) throw new Error(`sha256 mismatch (got ${got.slice(0, 12)}, want ${want.slice(0, 12)})`);
      exeCache = { version: release.version, sha256: want, buffer };
      return toAttachment(buffer);
    } catch (err) {
      console.warn(`[release] EXE fetch ${url} failed: ${err.message}`);
    }
  }
  console.warn(`[release] posting v${release.version} without EXE attachment`);
  return null;
}

function hasExeAttachment(message) {
  return [...(message.attachments?.values?.() || [])].some((a) => /\.exe$/i.test(a.name || ""));
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function footerMarker(version) {
  return `${FOOTER_PREFIX}${version}`;
}

/**
 * @param {object} release from /api/releases/latest
 * @param {{ announcement?: boolean }} [opts]
 */
function buildReleaseEmbed(release, opts = {}) {
  const changes = (release.changes || []).map((c) => `• ${c}`).join("\n") || "• Maintenance update";
  const heading = opts.announcement ? "**A new Oxide update is out.**\n\n" : "";
  const title = `Oxide v${release.version}${release.title ? ` — ${release.title}` : ""}`;
  const released = release.date ? Math.floor(new Date(release.date).getTime() / 1000) : null;

  const embed = new EmbedBuilder()
    .setTitle(title.slice(0, 256))
    .setColor(0xe6852e)
    .setURL(release.changelogUrl || `${config.siteUrl}/changelog`)
    .setDescription(`${heading}${changes}`.slice(0, 4000))
    .addFields(
      { name: "Version", value: `\`v${release.version}\``, inline: true },
      { name: "Released", value: released ? `<t:${released}:D>` : "—", inline: true },
      { name: "Size", value: formatBytes(release.sizeBytes), inline: true }
    )
    .setFooter({
      text: `${footerMarker(release.version)} · sha256 ${String(release.sha256 || "").slice(0, 12) || "—"}`,
    });
  if (release.clientVersion) {
    embed.addFields({ name: "Roblox build", value: `\`${release.clientVersion}\``, inline: false });
  }
  if (release.date) embed.setTimestamp(new Date(release.date));
  return embed;
}

function releaseRows(release) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Download v${release.version}`)
        .setStyle(ButtonStyle.Link)
        .setURL(release.downloadUrl || `${config.apiBaseUrl}/downloads/Oxide.exe`),
      new ButtonBuilder()
        .setLabel("Changelog")
        .setStyle(ButtonStyle.Link)
        .setURL(release.changelogUrl || `${config.siteUrl}/changelog`),
      new ButtonBuilder().setLabel("Website").setStyle(ButtonStyle.Link).setURL(config.siteUrl)
    ),
  ];
}

/**
 * UPDATES_CHANNEL_ID when set, else the existing #announcements channel.
 * @param {import('discord.js').Guild} guild
 */
async function resolveUpdatesChannel(guild) {
  if (config.updatesChannelId) {
    const ch = await guild.channels.fetch(config.updatesChannelId).catch(() => null);
    if (!ch?.isTextBased()) {
      throw new Error(`UPDATES_CHANNEL_ID ${config.updatesChannelId} is not a text channel the bot can see`);
    }
    return ch;
  }
  await guild.channels.fetch();
  const ch =
    findChannel(guild, CHANNELS.announcements, ChannelType.GuildText) ||
    findChannel(guild, CHANNELS.announcements, ChannelType.GuildAnnouncement);
  if (!ch?.isTextBased()) {
    throw new Error("#announcements not found — set UPDATES_CHANNEL_ID or run /setup-server");
  }
  return ch;
}

function isAnnouncementFor(message, botId, version) {
  if (message.author?.id !== botId) return false;
  const marker = footerMarker(version);
  return (message.embeds || []).some(
    (e) => String(e.footer?.text || "").split(" · ")[0] === marker
  );
}

async function findExistingAnnouncement(channel, botId, version) {
  const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const hit = recent && [...recent.values()].find((m) => isAnnouncementFor(m, botId, version));
  if (hit) return hit;
  const pinned = await channel.messages.fetchPinned().catch(() => null);
  return (pinned && [...pinned.values()].find((m) => isAnnouncementFor(m, botId, version))) || null;
}

/**
 * Post the latest release to the updates channel once per version.
 * Safe to call on every poll / restart / HTTP trigger.
 * @param {import('discord.js').Client} client
 * @param {{ force?: boolean }} [opts]
 */
async function announceLatestRelease(client, opts = {}) {
  const run = async () => {
    const release = await fetchLatestRelease();
    if (!release) return { ok: false, error: "no_release", message: "API has no published release." };
    if (release.hosted && release.hosted.matches === false) {
      return {
        ok: false,
        error: "exe_not_deployed",
        version: release.version,
        message: "Hosted Oxide.exe hash does not match the release yet — not announcing.",
      };
    }

    const store = readJson(STORE_FILE, {
      version: null,
      messageId: null,
      channelId: null,
      attached: false,
    });
    if (!opts.force && store.version === release.version && store.messageId && store.attached) {
      return {
        ok: true,
        announced: false,
        attached: true,
        version: release.version,
        channelId: store.channelId,
        messageId: store.messageId,
        reason: "already_announced",
      };
    }

    const guild = await client.guilds.fetch(config.guildId);
    const channel = await resolveUpdatesChannel(guild);

    if (!opts.force) {
      const existing = await findExistingAnnouncement(channel, client.user.id, release.version);
      if (existing) {
        let attached = hasExeAttachment(existing);
        let backfilled = false;
        if (!attached) {
          // Older announcement without the EXE: add it in place rather than reposting.
          const file = await fetchReleaseAttachment(release);
          if (file) {
            try {
              await existing.edit({
                embeds: [buildReleaseEmbed(release, { announcement: true })],
                components: releaseRows(release),
                files: [file],
              });
              attached = true;
              backfilled = true;
              console.log(`[release] attached Oxide.exe to existing v${release.version} post`);
            } catch (err) {
              console.warn(`[release] could not edit v${release.version} post with EXE: ${err.message}`);
            }
          }
        }
        writeJson(STORE_FILE, {
          version: release.version,
          messageId: existing.id,
          channelId: channel.id,
          attached,
        });
        return {
          ok: true,
          announced: false,
          attached,
          backfilled,
          version: release.version,
          channelId: channel.id,
          channelName: channel.name,
          messageId: existing.id,
          reason: "already_announced",
        };
      }
    }

    const ping = config.updatesPing;
    const file = await fetchReleaseAttachment(release);
    const sent = await channel.send({
      content: ping || undefined,
      embeds: [buildReleaseEmbed(release, { announcement: true })],
      components: releaseRows(release),
      files: file ? [file] : [],
      allowedMentions: ping ? { parse: ["everyone", "roles"] } : { parse: [] },
    });
    if (channel.type === ChannelType.GuildAnnouncement) {
      await sent.crosspost().catch(() => {});
    }
    writeJson(STORE_FILE, {
      version: release.version,
      messageId: sent.id,
      channelId: channel.id,
      attached: Boolean(file),
    });
    console.log(
      `[release] announced v${release.version} in #${channel.name}${file ? " with Oxide.exe" : " (no attachment)"}`
    );
    return {
      ok: true,
      announced: true,
      attached: Boolean(file),
      version: release.version,
      channelId: channel.id,
      channelName: channel.name,
      messageId: sent.id,
    };
  };

  const result = announceChain.then(run, run);
  announceChain = result.catch(() => {});
  return result;
}

function lastAnnounced() {
  return readJson(STORE_FILE, { version: null, messageId: null, channelId: null });
}

module.exports = {
  fetchLatestRelease,
  fetchReleases,
  buildReleaseEmbed,
  releaseRows,
  fetchReleaseAttachment,
  announceLatestRelease,
  lastAnnounced,
};
