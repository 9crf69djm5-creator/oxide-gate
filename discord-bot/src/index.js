"use strict";

const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  ChannelType,
  MessageFlags,
} = require("discord.js");
const { config } = require("./config");
const { registerCommands } = require("./register");
const { handleCommand } = require("./commands");
const { setupGuild, needsSetup, findRole, findChannel } = require("./setup");
const { syncRobloxVersion } = require("./roblox");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

let robloxTimer = null;

async function runRobloxJob(reason) {
  try {
    const result = await syncRobloxVersion(client, config.guildId);
    const tag = result.changed ? "CHANGED" : result.first ? "FIRST" : "ok";
    console.log(`[roblox] ${reason}: ${tag} ${result.version}`);
  } catch (err) {
    console.warn(`[roblox] ${reason} failed:`, err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(
    `[config] API=${config.apiBaseUrl} ADMIN_SECRET=${config.adminSecret ? "set" : "MISSING"}`
  );

  try {
    await registerCommands();
  } catch (err) {
    console.error("Command registration failed:", err.message);
  }

  try {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.channels.fetch();
    if (config.autoSetup && needsSetup(guild)) {
      console.log("Empty/partial layout detected — running auto /setup…");
      const summary = await setupGuild(guild);
      console.log("Auto-setup done:", summary);
    }
  } catch (err) {
    console.warn("Auto-setup skipped:", err.message);
  }

  await runRobloxJob("startup");
  if (robloxTimer) clearInterval(robloxTimer);
  robloxTimer = setInterval(() => runRobloxJob("poll"), config.robloxPollMs);
  console.log(`Roblox poll every ${config.robloxPollMs / 60000} min`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== config.guildId) return;
  try {
    await member.guild.roles.fetch();
    const memberRole = findRole(member.guild, "Member");
    if (memberRole && !member.roles.cache.has(memberRole.id)) {
      await member.roles.add(memberRole, "OXIDE auto Member on join");
      console.log(`[join] Assigned Member → ${member.user.tag}`);
    }

    if (config.welcomeEnabled) {
      const welcomeCh =
        findChannel(member.guild, "announcements", ChannelType.GuildText) ||
        findChannel(member.guild, "help", ChannelType.GuildText);
      if (welcomeCh?.isTextBased()) {
        await welcomeCh.send({
          content:
            `Welcome <@${member.id}> — you're a **Member**. ` +
            `Buy at ${config.siteUrl}/buy · Support: #help · Invite: ${config.discordInvite}`,
        });
      }
    }
  } catch (err) {
    console.warn(`[join] ${member.user?.tag || member.id}:`, err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleCommand(interaction, client);
  } catch (err) {
    // 10062 = interaction expired / already acknowledged — ignore, don't crash
    if (err?.code === 10062) {
      console.warn(`[cmd ${interaction.commandName}] interaction expired (10062)`);
      return;
    }
    console.error(`[cmd ${interaction.commandName}]`, err);
    const payload = {
      content: `Error: \`${err.message}\``,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err?.message || err);
});
client.on("error", (err) => {
  console.error("[discord client]", err?.message || err);
});

client.login(config.token).catch((err) => {
  console.error("Login failed:", err.message);
  process.exit(1);
});

// Optional HTTP bind so Render free Web Service stays healthy (PORT set by host).
// Free web services still sleep after ~15m with no inbound HTTP — mutual keep-alive
// with gate-api + GitHub Action / external ping keep both awake.
const port = Number(process.env.PORT);
if (Number.isFinite(port) && port > 0) {
  const http = require("http");
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "oxide-discord-bot",
          ready: Boolean(client.isReady()),
          user: client.user?.tag || null,
          adminSecretConfigured: Boolean(config.adminSecret),
        })
      );
    })
    .listen(port, () => console.log(`Health HTTP on :${port}`));

  const peers = [
    process.env.KEEP_ALIVE_URL,
    process.env.GATE_API_HEALTH_URL,
    `${String(config.apiBaseUrl || "").replace(/\/$/, "")}/api/health`,
    "https://oxide-gate-api.onrender.com/api/health",
  ]
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i);

  const pingPeers = async () => {
    for (const url of peers) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 25000);
        await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "OXIDE-KeepAlive/1.0" },
          signal: ac.signal,
        });
        clearTimeout(t);
      } catch (err) {
        console.warn(`[keep-alive] ${url}: ${err.message}`);
      }
    }
  };
  setTimeout(pingPeers, 60000);
  const keepTimer = setInterval(pingPeers, 8 * 60 * 1000);
  if (keepTimer.unref) keepTimer.unref();
  console.log(`Keep-alive peers: ${peers.join(", ")}`);
}

process.on("SIGINT", () => {
  if (robloxTimer) clearInterval(robloxTimer);
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (robloxTimer) clearInterval(robloxTimer);
  client.destroy();
  process.exit(0);
});
