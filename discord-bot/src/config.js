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
};

module.exports = { config };
