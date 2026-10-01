"use strict";

const {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { config } = require("./config");
const { registerCommands } = require("./register");
const { handleCommand, handleButton, handleModal, isStaffPlus } = require("./commands");
const {
  setupGuild,
  needsSetup,
  findChannel,
  isHoneypotChannel,
  CHANNELS,
} = require("./setup");
const { syncRobloxVersion } = require("./roblox");
const { syncStatusChannel } = require("./status");
const { deliverKeyDm } = require("./deliver");
const { announceLatestRelease, lastAnnounced } = require("./releases");
const { brandEmbed, COLORS } = require("./brand");
const { ensureHelpChannel, handleHelpMessage, handleAsk, helpChannel } = require("./helpchat");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    ...(config.aiHelpEnabled
      ? [GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
      : []),
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

let robloxTimer = null;
let statusTimer = null;
let releaseTimer = null;

async function runReleaseJob(reason) {
  try {
    const result = await announceLatestRelease(client);
    const tag = result.announced ? "ANNOUNCED" : result.reason || result.error || "ok";
    console.log(`[release] ${reason}: ${tag} ${result.version || ""}`);
  } catch (err) {
    console.warn(`[release] ${reason} failed:`, err.message);
  }
}

function updatesChannelId() {
  if (config.updatesChannelId) return config.updatesChannelId;
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return null;
  return (
    findChannel(guild, CHANNELS.updates, ChannelType.GuildText) ||
    findChannel(guild, CHANNELS.updates, ChannelType.GuildAnnouncement)
  )?.id || null;
}

async function runRobloxJob(reason) {
  try {
    const result = await syncRobloxVersion(client, config.guildId);
    const tag = result.changed ? "CHANGED" : result.first ? "FIRST" : "ok";
    console.log(`[roblox] ${reason}: ${tag} ${result.version}`);
  } catch (err) {
    console.warn(`[roblox] ${reason} failed:`, err.message);
  }
}

async function runStatusJob(reason) {
  try {
    const result = await syncStatusChannel(client, config.guildId);
    console.log(
      `[status] ${reason}: ${result.created ? "posted" : "updated"} #status`
    );
  } catch (err) {
    console.warn(`[status] ${reason} failed:`, err.message);
  }
}

/**
 * Kick non-staff who type in the honeypot channel.
 * @param {import('discord.js').Message} message
 */
async function handleHoneypot(message) {
  if (!message.guild || message.guild.id !== config.guildId) return;
  if (message.author?.bot) return;
  if (!isHoneypotChannel(message.channel)) return;

  let member = message.member;
  if (!member) {
    member = await message.guild.members.fetch(message.author.id).catch(() => null);
  }
  if (!member) return;

  // Never kick staff / admins
  if (isStaffPlus(member)) return;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return;
  } catch {
    /* ignore */
  }

  const reason = "OXIDE honeypot: typed in #do-not-type";
  try {
    await message.delete().catch(() => {});
  } catch {
    /* ignore */
  }

  let kicked = false;
  try {
    await member.kick(reason);
    kicked = true;
  } catch (err) {
    console.warn(`[honeypot] kick failed ${message.author.tag}:`, err.message);
  }

  const logCh =
    findChannel(message.guild, CHANNELS.keyLogs, ChannelType.GuildText) ||
    findChannel(message.guild, "staff-chat", ChannelType.GuildText);

  if (logCh?.isTextBased()) {
    await logCh
      .send({
        embeds: [
          new EmbedBuilder()
            .setTitle(kicked ? "Honeypot kick" : "Honeypot kick FAILED")
            .setColor(kicked ? 0xe74c3c : 0xe6852e)
            .setDescription(
              `<@${message.author.id}> (\`${message.author.tag}\` · \`${message.author.id}\`)\n` +
                (kicked
                  ? "Kicked for typing in 🚫・do-not-type."
                  : "Could not kick — check bot role hierarchy / permissions.")
            )
            .setTimestamp(new Date())
            .setFooter({ text: "OXIDE anti-spam" }),
        ],
      })
      .catch(() => {});
  }

  console.log(
    `[honeypot] ${kicked ? "kicked" : "FAILED"} ${message.author.tag}`
  );
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
      console.log("Empty/partial layout detected — running auto /setup-server…");
      const summary = await setupGuild(guild, {
        siteUrl: config.siteUrl,
        discordInvite: config.discordInvite,
      });
      console.log("Auto-setup done:", summary);
    }
  } catch (err) {
    console.warn("Auto-setup skipped:", err.message);
  }

  if (config.aiHelpEnabled) {
    try {
      const guild = await client.guilds.fetch(config.guildId);
      const { channel, created } = await ensureHelpChannel(guild);
      console.log(`[ai] help channel #${channel.name} (${channel.id})${created ? " created" : ""}`);
    } catch (err) {
      console.warn("[ai] help channel setup failed:", err.message);
    }
  }

  await runRobloxJob("startup");
  await runStatusJob("startup");

  if (robloxTimer) clearInterval(robloxTimer);
  robloxTimer = setInterval(() => runRobloxJob("poll"), config.robloxPollMs);
  console.log(`Roblox poll every ${config.robloxPollMs / 60000} min`);

  if (statusTimer) clearInterval(statusTimer);
  // Refresh #status every 10 minutes
  statusTimer = setInterval(() => runStatusJob("poll"), 10 * 60 * 1000);
  if (statusTimer.unref) statusTimer.unref();
  console.log("Status channel poll every 10 min");

  if (config.releaseAnnounceEnabled) {
    await runReleaseJob("startup");
    if (releaseTimer) clearInterval(releaseTimer);
    releaseTimer = setInterval(() => runReleaseJob("poll"), config.releasePollMs);
    if (releaseTimer.unref) releaseTimer.unref();
    console.log(`Release announce poll every ${config.releasePollMs / 60000} min`);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== config.guildId) return;
  try {
    // Do NOT auto-grant Citizen — they must verify.
    if (config.welcomeEnabled) {
      const verifyCh = findChannel(
        member.guild,
        CHANNELS.verify,
        ChannelType.GuildText
      );
      if (verifyCh?.isTextBased()) {
        await verifyCh.send({
          content:
            `Welcome <@${member.id}> — click the **Verify** button above to unlock OXIDE.\n` +
            `Do **not** type in 🚫・do-not-type.`,
        });
      }
    }
  } catch (err) {
    console.warn(`[join] ${member.user?.tag || member.id}:`, err.message);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleHoneypot(message);
  } catch (err) {
    console.warn("[honeypot]", err.message);
  }
  if (!config.aiHelpEnabled) return;
  try {
    await handleHelpMessage(message, client);
  } catch (err) {
    console.warn("[ai]", err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ask") {
      await handleAsk(interaction);
      return;
    }
    // Every other command is guild-only; /ask is the only one exposed in DMs.
    if (!interaction.guildId) return;
    await handleCommand(interaction, client);
  } catch (err) {
    if (err?.code === 10062) {
      console.warn(
        `[interaction] expired (10062) ${interaction.commandName || interaction.customId}`
      );
      return;
    }
    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(
      `[interaction ${interaction.commandName || interaction.customId}] ref=${ref}`,
      err
    );
    const payload = {
      embeds: [
        brandEmbed({
          title: "Something went wrong",
          color: COLORS.danger,
          footer: `ref ${ref}`,
          description:
            "That command hit an unexpected error. Try again in a moment.\n" +
            `If it keeps happening, post in the help channel with reference \`${ref}\`.`,
        }),
      ],
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
// CORS is required so gate-site (localhost / Vercel) can read ready/user in the browser.
// Also accepts POST /internal/deliver-key from gate-api (claim → Discord DM).
const port = Number(process.env.PORT);
if (Number.isFinite(port) && port > 0) {
  const http = require("http");
  const healthCors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, POST",
    "Access-Control-Allow-Headers": "Accept, Content-Type, X-Admin-Secret",
    "Access-Control-Max-Age": "86400",
  };

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on("error", reject);
    });
  }

  http
    .createServer(async (req, res) => {
      const urlPath = String(req.url || "/").split("?")[0];

      if (req.method === "OPTIONS") {
        res.writeHead(204, healthCors);
        res.end();
        return;
      }

      if (req.method === "POST" && urlPath === "/internal/deliver-key") {
        const secret = req.headers["x-admin-secret"];
        if (!config.adminSecret || secret !== config.adminSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        try {
          const body = await readBody(req);
          if (!client.isReady()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "bot_not_ready" }));
            return;
          }
          const result = await deliverKeyDm(client, body);
          res.writeHead(result.ok ? 200 : 400, {
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ ok: false, error: "server_error", message: err.message })
          );
        }
        return;
      }

      if (req.method === "POST" && urlPath === "/internal/resolve-users") {
        const secret = req.headers["x-admin-secret"];
        if (!config.adminSecret || secret !== config.adminSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        try {
          const body = await readBody(req).catch(() => ({}));
          if (!client.isReady()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "bot_not_ready" }));
            return;
          }
          const ids = (Array.isArray(body?.ids) ? body.ids : [])
            .map((s) => String(s || "").trim())
            .filter((s) => /^\d{5,32}$/.test(s))
            .slice(0, 200);
          const users = {};
          await Promise.all(
            ids.map(async (id) => {
              const u = await client.users.fetch(id).catch(() => null);
              if (u) users[id] = { username: u.username, globalName: u.globalName || null };
            })
          );
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, users }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "resolve_failed", message: err.message }));
        }
        return;
      }

      if (req.method === "POST" && urlPath === "/internal/announce-release") {
        const secret = req.headers["x-admin-secret"];
        if (!config.adminSecret || secret !== config.adminSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }
        try {
          const body = await readBody(req).catch(() => ({}));
          if (!client.isReady()) {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "bot_not_ready" }));
            return;
          }
          const result = await announceLatestRelease(client, { force: body?.force === true });
          res.writeHead(result.ok ? 200 : 409, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ ok: false, error: "announce_failed", message: err.message })
          );
        }
        return;
      }

      res.writeHead(200, {
        "Content-Type": "application/json",
        ...healthCors,
      });
      res.end(
        JSON.stringify({
          ok: true,
          service: "oxide-discord-bot",
          ready: Boolean(client.isReady()),
          user: client.user?.tag || null,
          adminSecretConfigured: Boolean(config.adminSecret),
          releaseAnnouncer: config.releaseAnnounceEnabled,
          announcePolicy: "skip-older",
          announcedVersion: lastAnnounced().version,
          updatesChannelId: updatesChannelId(),
          aiHelp: config.aiHelpEnabled,
          helpChannelId: helpChannel(),
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
  if (statusTimer) clearInterval(statusTimer);
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (robloxTimer) clearInterval(robloxTimer);
  if (statusTimer) clearInterval(statusTimer);
  client.destroy();
  process.exit(0);
});
