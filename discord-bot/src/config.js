"use strict";

require("dotenv").config();

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return String(v).trim();
}

function optional(name, fallback = "") {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

function pollMs() {
  const pollRaw = Number(process.env.ROBLOX_POLL_MINUTES || 20);
  const pollMinutes = Number.isFinite(pollRaw)
    ? Math.min(30, Math.max(15, pollRaw))
    : 20;
  return pollMinutes * 60 * 1000;
}

/** Lazy getters so `commandData` can load without a token present. */
const config = {
  get token() {
    return required("DISCORD_TOKEN");
  },
  get clientId() {
    return required("CLIENT_ID");
  },
  get guildId() {
    return required("GUILD_ID");
  },
  get adminSecret() {
    return optional("ADMIN_SECRET");
  },
  /** Extra Discord ids allowed to use /admin-login besides the guild owner. */
  get ownerDiscordIds() {
    return optional("OWNER_DISCORD_IDS")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d{5,32}$/.test(s));
  },
  get apiBaseUrl() {
    return optional("API_BASE_URL", "https://oxide-gate-api.onrender.com").replace(/\/$/, "");
  },
  get discordInvite() {
    return optional("DISCORD_INVITE", "https://discord.gg/3PXJ8r56T");
  },
  get robloxPollMs() {
    return pollMs();
  },
  get autoSetup() {
    return String(process.env.AUTO_SETUP || "true").toLowerCase() !== "false";
  },
  get welcomeEnabled() {
    return String(process.env.WELCOME_MESSAGE || "true").toLowerCase() !== "false";
  },
  get siteUrl() {
    return optional("SITE_URL", "https://oxide-gate-site.vercel.app").replace(/\/$/, "");
  },
  /** Optional override for the channel the OXIDE AI answers in (default: #help). */
  get helpChannelId() {
    return optional("HELP_CHANNEL_ID");
  },
  get aiHelpEnabled() {
    return String(process.env.AI_HELP || "true").toLowerCase() !== "false";
  },
  /** Optional override; default posts release announcements in #updates. */
  get updatesChannelId() {
    return optional("UPDATES_CHANNEL_ID");
  },
  /** Optional text prepended to announcements, e.g. "@everyone" or "<@&roleId>". */
  get updatesPing() {
    return optional("UPDATES_PING");
  },
  get releaseAnnounceEnabled() {
    return String(process.env.RELEASE_ANNOUNCE || "true").toLowerCase() !== "false";
  },
  get releasePollMs() {
    const raw = Number(process.env.RELEASE_POLL_MINUTES || 5);
    const minutes = Number.isFinite(raw) ? Math.min(60, Math.max(1, raw)) : 5;
    return minutes * 60 * 1000;
  },
};

module.exports = { config };
