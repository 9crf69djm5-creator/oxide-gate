"use strict";

/**
 * Shared look for bot replies so embeds match the website (black + #ff9500).
 */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { config } = require("./config");

const COLORS = {
  brand: 0xff9500,
  ok: 0x6fbf7a,
  warn: 0xffae2b,
  danger: 0xe85d4c,
  info: 0x5dade2,
};

function siteHost() {
  return config.siteUrl.replace(/^https?:\/\//, "");
}

/**
 * @param {{ title?: string, description?: string, color?: number, footer?: string|false }} [opts]
 */
function brandEmbed(opts = {}) {
  const embed = new EmbedBuilder().setColor(opts.color ?? COLORS.brand);
  if (opts.title) embed.setTitle(opts.title);
  if (opts.description) embed.setDescription(opts.description);
  if (opts.footer !== false) {
    embed.setFooter({ text: opts.footer ? `OXIDE · ${opts.footer}` : `OXIDE · ${siteHost()}` });
  }
  return embed;
}

/** Link-button row. Each item: [label, url]. Max 5. */
function linkRow(items) {
  return new ActionRowBuilder().addComponents(
    items
      .filter(([, url]) => url && /^https?:\/\//i.test(url))
      .slice(0, 5)
      .map(([label, url]) =>
        new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url)
      )
  );
}

/**
 * Short, human error reply for API/network failures. Raw detail stays in a code span
 * at the end so staff can still diagnose from screenshots.
 * @param {string} what e.g. "look up your license"
 * @param {unknown} [err]
 */
function unreachableEmbed(what, err) {
  const detail = err && typeof err === "object" && "message" in err ? err.message : err;
  return brandEmbed({
    title: "OXIDE servers are not responding",
    color: COLORS.warn,
    description:
      `Could not ${what} right now. The API may be waking up — try again in about 30 seconds.\n\n` +
      `Live status: ${config.siteUrl}/status` +
      (detail ? `\n\n\`${String(detail).slice(0, 180)}\`` : ""),
  });
}

module.exports = { COLORS, brandEmbed, linkRow, unreachableEmbed, siteHost };
