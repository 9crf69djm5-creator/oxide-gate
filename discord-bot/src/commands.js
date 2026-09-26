"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  setupGuild,
  findRole,
  findChannel,
  STAFF_PLUS,
  VERIFY_BUTTON_ID,
  CHANNELS,
} = require("./setup");
const { syncRobloxVersion, fetchRobloxWindowsVersion, buildEmbed, readLocalClientVersion } = require("./roblox");
const {
  fetchHealth,
  fetchProducts,
  createKeys,
  revokeKey,
  resetHwid,
  redeemKey,
  fetchLicenseByDiscord,
  linkDiscordKey,
  linkRobloxIdentity,
  fetchLicenseByRoblox,
  adminRecover,
} = require("./gate");
const { collectStatusSnapshot, buildStatusEmbed, syncStatusChannel } = require("./status");
const { getLicense, setLicense } = require("./licenses");
const { config } = require("./config");

const DEFAULT_DOWNLOAD =
  "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

/** Button customId prefix: license_reveal:<discordUserId> */
const LICENSE_REVEAL_PREFIX = "license_reveal:";
/** Open modal to paste / link an existing OXIDE key */
const LINK_KEY_BUTTON_ID = "oxide_link_key";
const LINK_KEY_MODAL_ID = "oxide_link_key_modal";
const LINK_KEY_INPUT_ID = "oxide_link_key_value";

/**
 * @param {import('discord.js').GuildMember} member
 */
function isStaffPlus(member) {
  if (!member) return false;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  } catch {
    /* permissions bitfield may be missing on partials */
  }
  const guild = member.guild;
  if (!guild) return false;
  const cache = member.roles?.cache;
  if (!cache) return false;
  return STAFF_PLUS.some((name) => {
    const role = findRole(guild, name);
    return role && cache.has(role.id);
  });
}

/**
 * Citizen / Customer / Staff / Member (legacy) — public verified access.
 * @param {import('discord.js').GuildMember|null} member
 */
function isCitizen(member) {
  if (!member) return false;
  if (isStaffPlus(member)) return true;
  const guild = member.guild;
  if (!guild) return false;
  const cache = member.roles?.cache;
  if (!cache) return false;
  return ["Citizen", "Customer", "Reseller", "Member"].some((name) => {
    const role = findRole(guild, name);
    return role && cache.has(role.id);
  });
}

/**
 * @param {import('discord.js').GuildMember|null} member
 */
function hasCustomerAccess(member) {
  if (!member) return false;
  try {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  } catch {
    /* ignore */
  }
  if (isStaffPlus(member)) return true;
  const customer = findRole(member.guild, "Customer");
  return Boolean(customer && member.roles.cache.has(customer.id));
}

function downloadUrl(preferred) {
  const url = String(preferred || "").trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  return `${config.apiBaseUrl}/downloads/Oxide.exe` || DEFAULT_DOWNLOAD;
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

function remainingFromExpires(expires) {
  if (!expires) {
    return { daysRemaining: null, remainingLabel: "Lifetime", expired: false };
  }
  const end = Date.parse(expires);
  if (!Number.isFinite(end)) {
    return { daysRemaining: null, remainingLabel: String(expires), expired: false };
  }
  const ms = end - Date.now();
  if (ms <= 0) {
    return { daysRemaining: 0, remainingLabel: "Expired", expired: true };
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  let remainingLabel;
  if (days >= 2) remainingLabel = `${days} days left`;
  else if (days === 1) remainingLabel = `1 day, ${hours}h left`;
  else if (hours >= 1) remainingLabel = `${hours}h ${mins}m left`;
  else remainingLabel = `${Math.max(1, mins)}m left`;
  return {
    daysRemaining: Math.ceil(ms / 86400000),
    remainingLabel,
    expired: false,
  };
}

function formatExpiry(expires) {
  if (!expires) return "Lifetime / none";
  const t = Date.parse(expires);
  if (!Number.isFinite(t)) return String(expires);
  return `<t:${Math.floor(t / 1000)}:F> (<t:${Math.floor(t / 1000)}:R>)`;
}

function statusLabel(status, expired) {
  if (expired || status === "expired") return "Expired";
  if (status === "banned") return "Banned";
  if (status === "active") return "Active";
  if (status === "unused") return "Unused";
  return status ? String(status) : "Active";
}

/**
 * Success embed after redeem / for linked license.
 * @param {object} opts
 */
function buildRedeemEmbed(opts) {
  const {
    key,
    plan,
    expires,
    alreadyActive,
    title = "OXIDE license ready",
    reveal = true,
    status,
    remainingLabel,
    daysRemaining,
  } = opts;
  const rem =
    remainingLabel != null
      ? { remainingLabel, daysRemaining, expired: false }
      : remainingFromExpires(expires);
  const displayKey = reveal ? key : maskKey(key);
  const dl = downloadUrl(opts.downloadUrl);
  const fields = [
    { name: "Key", value: `\`${displayKey}\``, inline: false },
    { name: "Plan", value: plan || "—", inline: true },
    {
      name: "Time left",
      value:
        rem.daysRemaining != null && !rem.expired
          ? `${rem.remainingLabel} (${rem.daysRemaining}d)`
          : rem.remainingLabel || "—",
      inline: true,
    },
    {
      name: "Status",
      value: alreadyActive
        ? statusLabel(status || "active", rem.expired) +
          (reveal ? " (linked)" : "")
        : statusLabel(status || "active", rem.expired),
      inline: true,
    },
    { name: "Expires", value: formatExpiry(expires), inline: false },
    { name: "Download", value: `[Oxide.exe](${dl})`, inline: false },
  ];
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(rem.expired ? 0xe74c3c : 0xe6852e)
    .setDescription(
      reveal
        ? "**Paste this key into Oxide.exe when it asks.**\n" +
            "Download the EXE, launch it, and enter the key below."
        : "**Your license is linked to this Discord.**\n" +
            "Key is masked — tap **Reveal key** if you need the full string."
    )
    .addFields(fields)
    .setFooter({ text: "Keep this key private — do not share it publicly." });
}

function downloadRow(url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Download Oxide.exe")
      .setStyle(ButtonStyle.Link)
      .setURL(downloadUrl(url))
  );
}

/** Public site link buttons: Buy / Get key / Status / Offsets */
function websiteRows() {
  const base = config.siteUrl;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Buy")
        .setStyle(ButtonStyle.Link)
        .setURL(`${base}/buy`),
      new ButtonBuilder()
        .setLabel("Get key")
        .setStyle(ButtonStyle.Link)
        .setURL(`${base}/key`),
      new ButtonBuilder()
        .setLabel("Status")
        .setStyle(ButtonStyle.Link)
        .setURL(`${base}/status`),
      new ButtonBuilder()
        .setLabel("Offsets")
        .setStyle(ButtonStyle.Link)
        .setURL(`${base}/offsets`)
    ),
  ];
}

function buildWebsiteEmbed() {
  const base = config.siteUrl;
  return new EmbedBuilder()
    .setTitle("OXIDE website")
    .setColor(0xe6852e)
    .setURL(base)
    .setDescription(
      `Official site: **[${base.replace(/^https?:\/\//, "")}](${base})**\n` +
        "Buy a plan, claim your key, check status, or grab offsets."
    )
    .addFields(
      { name: "Buy", value: `[Open](${base}/buy)`, inline: true },
      { name: "Get key", value: `[Open](${base}/key)`, inline: true },
      { name: "Status", value: `[Open](${base}/status)`, inline: true },
      { name: "Offsets", value: `[Open](${base}/offsets)`, inline: true }
    )
    .setFooter({ text: "Aliases: /website · /site · /web" });
}

function licenseRows(opts) {
  const { download, discordUserId, reveal = false } = opts;
  const rows = [downloadRow(download)];
  if (!reveal && discordUserId) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${LICENSE_REVEAL_PREFIX}${discordUserId}`)
          .setLabel("Reveal key")
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }
  return rows;
}

/** Ephemeral “no Discord link yet” embed + actions. */
function noKeyLinkedPayload() {
  const siteKey = `${config.siteUrl}/key`;
  const embed = new EmbedBuilder()
    .setTitle("No OXIDE key linked to Discord")
    .setColor(0xe6852e)
    .setDescription(
      "This Discord account is not linked to a license yet.\n\n" +
        "**Already claimed on Roblox?** Run `/link-roblox username:YourRobloxName` — that recovers keys saved under your Roblox forever.\n\n" +
        "**Have the `OXIDE-…` key?** Click **Link my key** or run `/redeem` / `/bind`.\n\n" +
        "Site-only redeem does **not** auto-connect Discord until you `/redeem` or `/link-roblox` once."
    )
    .addFields(
      {
        name: "Best path after buying",
        value:
          "1. Claim on the site with your Roblox username\n" +
          "2. `/link-roblox` here (or `/redeem` with the key)\n" +
          "3. `/mykey` / `/recover` anytime",
        inline: false,
      },
      {
        name: "Need a key?",
        value: `Buy / claim: ${config.siteUrl}/buy`,
        inline: false,
      }
    )
    .setFooter({ text: "Linking is private (ephemeral) — only you see it." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LINK_KEY_BUTTON_ID)
      .setLabel("Link my key")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setLabel("Open Get a key")
      .setStyle(ButtonStyle.Link)
      .setURL(siteKey),
    new ButtonBuilder()
      .setLabel("Buy / claim")
      .setStyle(ButtonStyle.Link)
      .setURL(`${config.siteUrl}/buy`)
  );

  return { embeds: [embed], components: [row] };
}

function linkKeyModal() {
  return new ModalBuilder()
    .setCustomId(LINK_KEY_MODAL_ID)
    .setTitle("Link OXIDE key to Discord")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(LINK_KEY_INPUT_ID)
          .setLabel("Your OXIDE license key")
          .setPlaceholder("OXIDE-XXXX-XXXX-XXXX")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(64)
      )
    );
}

/**
 * Redeem/link a key for the interacting user (interaction already deferred).
 * @param {import('discord.js').ChatInputCommandInteraction|import('discord.js').ModalSubmitInteraction} interaction
 * @param {string} rawKey
 */
async function runRedeemFlow(interaction, rawKey) {
  const keyInput = String(rawKey || "").trim();
  if (!keyInput) {
    return interaction.editReply({
      content: "Provide a license key (OXIDE-…).",
    });
  }

  let result;
  try {
    result = await redeemKey({
      apiBaseUrl: config.apiBaseUrl,
      key: keyInput,
      discordUserId: interaction.user.id,
    });
  } catch (err) {
    return interaction.editReply({
      content: `Gate unreachable: \`${err.message}\``,
    });
  }

  if (!result.ok) {
    const msg =
      result.body?.message ||
      result.body?.error ||
      `Redeem failed (HTTP ${result.status})`;
    return interaction.editReply({
      content:
        `❌ ${msg}\n` +
        "If this key is already active on the site, `/redeem` still links it to Discord — double-check the full key.",
    });
  }

  const body = result.body;
  const key = body.key || keyInput;
  const dl = downloadUrl(body.downloadUrl);

  setLicense(interaction.user.id, {
    key,
    plan: body.plan,
    planId: body.planId,
    expires: body.expires ?? null,
    downloadUrl: dl,
    status: body.status || "active",
    remainingLabel: body.remainingLabel,
    daysRemaining: body.daysRemaining,
    redeemedAt: new Date().toISOString(),
  });

  await ensureCitizenRole(interaction);
  const roleResult = await assignCustomerRole(interaction);
  const embed = buildRedeemEmbed({
    key,
    plan: body.plan,
    expires: body.expires,
    downloadUrl: dl,
    alreadyActive: Boolean(body.alreadyActive),
    status: body.status,
    remainingLabel: body.remainingLabel,
    daysRemaining: body.daysRemaining,
    reveal: true,
    title: body.alreadyActive
      ? "OXIDE license linked"
      : "OXIDE license ready",
  });
  const row = downloadRow(dl);

  const dmPayload = { embeds: [embed], components: [row] };
  const { delivered } = await dmOrEphemeralFollowUp(interaction, dmPayload);

  const roleNote =
    roleResult.ok
      ? roleResult.already
        ? "Customer role already assigned."
        : "Customer role assigned."
      : roleResult.reason === "missing_role"
        ? "Customer role missing — run `/setup-server`."
        : roleResult.reason === "not_in_guild"
          ? "Redeemed (DM only — join the server for Customer role)."
          : `Could not assign Customer: ${roleResult.reason}`;

  if (delivered === "dm") {
    return interaction.editReply({
      content:
        "✅ Key linked to your Discord (saved on the API for `/mykey`).\n" +
        "Check your **DMs** for the key, plan, and download.\n" +
        `${roleNote}\n` +
        "Later: `/mykey` or `/license` to recover the key + days left.\n" +
        "Paste the key into **Oxide.exe** when it asks.",
    });
  }

  return interaction.editReply({
    content:
      "✅ Key linked to your Discord (could not DM you — enable DMs from server members, or use this reply).\n" +
      `${roleNote}\n` +
      "Use `/mykey` anytime to recover your key.",
    embeds: [embed],
    components: [row],
  });
}

/**
 * Try DM first; fall back to ephemeral reply content.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} payload
 */
async function dmOrEphemeralFollowUp(interaction, payload) {
  try {
    await interaction.user.send(payload);
    return { delivered: "dm" };
  } catch {
    return { delivered: "ephemeral" };
  }
}

/**
 * Assign Customer role if present (best-effort).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function assignCustomerRole(interaction) {
  if (!interaction.guild || !interaction.member) {
    return { ok: false, reason: "not_in_guild" };
  }
  const role = findRole(interaction.guild, "Customer");
  if (!role) return { ok: false, reason: "missing_role" };
  const member =
    interaction.member.roles?.cache != null
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return { ok: false, reason: "no_member" };
  if (member.roles.cache.has(role.id)) return { ok: true, already: true };
  try {
    await member.roles.add(role, "OXIDE /redeem");
    return { ok: true, already: false };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/**
 * Ensure Citizen after redeem (buyers should see community).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function ensureCitizenRole(interaction) {
  if (!interaction.guild || !interaction.member) return;
  const role = findRole(interaction.guild, "Citizen");
  if (!role) return;
  const member =
    interaction.member.roles?.cache != null
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || member.roles.cache.has(role.id)) return;
  await member.roles.add(role, "OXIDE redeem → Citizen").catch(() => {});
}

async function logToKeyLogs(guild, embed) {
  try {
    const logCh = findChannel(guild, CHANNELS.keyLogs);
    if (logCh?.isTextBased()) {
      await logCh.send({ embeds: [embed] });
    }
  } catch {
    /* ignore */
  }
}

const commandData = [
  new SlashCommandBuilder()
    .setName("setup-server")
    .setDescription("Create OXIDE roles, verify gate, honeypot, and pro channels (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Alias of /setup-server (Admin)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Get the Citizen role and unlock the server"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Bot latency check"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Live OXIDE API / downloads / products / bot health"),
  new SlashCommandBuilder()
    .setName("products")
    .setDescription("List OXIDE plans and Roblox gamepass links"),
  new SlashCommandBuilder()
    .setName("download")
    .setDescription("Get the Oxide.exe download link"),
  new SlashCommandBuilder()
    .setName("key-redeem")
    .setDescription("How to redeem an OXIDE license key"),
  new SlashCommandBuilder()
    .setName("roblox-version")
    .setDescription("Fetch latest Roblox Windows client version and update #roblox-versions"),
  new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem or link an OXIDE key to your Discord (existing keys OK)")
    .addStringOption((o) =>
      o.setName("key").setDescription("Your OXIDE-… license key").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("mykey")
    .setDescription("Show your linked OXIDE license, plan, and days left"),
  new SlashCommandBuilder()
    .setName("license")
    .setDescription("Show your linked OXIDE license (alias of /mykey)"),
  new SlashCommandBuilder()
    .setName("bind")
    .setDescription("Link an existing OXIDE key to your Discord (alias of /redeem)")
    .addStringOption((o) =>
      o.setName("key").setDescription("Your OXIDE-… license key").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("link-roblox")
    .setDescription("Link your Roblox username to Discord (recovers claimed keys)")
    .addStringOption((o) =>
      o
        .setName("username")
        .setDescription("Your Roblox username (same as claim)")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("recover")
    .setDescription("Recover your OXIDE key via Discord or linked Roblox")
    .addStringOption((o) =>
      o
        .setName("roblox")
        .setDescription("Optional: Roblox username to link + recover")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("key-create")
    .setDescription("Create license keys via gate API (Staff+ · needs ADMIN_SECRET)")
    .addStringOption((o) =>
      o
        .setName("plan")
        .setDescription("Plan label")
        .setRequired(false)
        .addChoices(
          { name: "week", value: "week" },
          { name: "month", value: "month" },
          { name: "lifetime", value: "lifetime" },
          { name: "premium", value: "premium" }
        )
    )
    .addIntegerOption((o) =>
      o.setName("count").setDescription("How many keys (1–20)").setMinValue(1).setMaxValue(20)
    )
    .addIntegerOption((o) =>
      o.setName("days").setDescription("Validity days (omit for lifetime/default)").setMinValue(1).setMaxValue(3650)
    ),
  new SlashCommandBuilder()
    .setName("key-revoke")
    .setDescription("Revoke (ban) a license key (Staff+)")
    .addStringOption((o) =>
      o.setName("key").setDescription("OXIDE-… key to revoke").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("hwid-reset")
    .setDescription("Clear HWID binding so a key can move machines (Staff+)")
    .addStringOption((o) =>
      o.setName("key").setDescription("OXIDE-… key").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("key-recover")
    .setDescription("Staff: recover a license by Roblox username and/or Discord id")
    .addStringOption((o) =>
      o
        .setName("roblox")
        .setDescription("Roblox username used at claim")
        .setRequired(false)
    )
    .addStringOption((o) =>
      o
        .setName("discord_id")
        .setDescription("Discord user snowflake")
        .setRequired(false)
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("Discord member to recover for").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Assign or remove OXIDE roles (Staff+)")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Add or remove")
        .setRequired(true)
        .addChoices(
          { name: "add", value: "add" },
          { name: "remove", value: "remove" }
        )
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("Member to update").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("role")
        .setDescription("Role to assign")
        .setRequired(true)
        .addChoices(
          { name: "Citizen", value: "Citizen" },
          { name: "Customer", value: "Customer" },
          { name: "Reseller", value: "Reseller" },
          { name: "Staff", value: "Staff" },
          { name: "Admin", value: "Admin" }
        )
    ),
  new SlashCommandBuilder()
    .setName("website")
    .setDescription("Share the OXIDE website and quick links"),
  new SlashCommandBuilder()
    .setName("site")
    .setDescription("Share the OXIDE website (alias of /website)"),
  new SlashCommandBuilder()
    .setName("web")
    .setDescription("Share the OXIDE website (alias of /website)"),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("List OXIDE bot commands"),
].map((c) => c.toJSON());

/**
 * Handle verify button + /verify
 * @param {import('discord.js').ButtonInteraction|import('discord.js').ChatInputCommandInteraction} interaction
 */
async function grantCitizen(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "Use this inside the OXIDE Discord server.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const deferred = interaction.deferred || interaction.replied;
  if (!deferred) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const role = findRole(interaction.guild, "Citizen");
  if (!role) {
    return interaction.editReply({
      content: "Citizen role missing — an Admin must run `/setup-server` first.",
    });
  }

  const member =
    interaction.member?.roles?.cache != null
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  if (!member) {
    return interaction.editReply({ content: "Could not load your member profile." });
  }

  if (member.roles.cache.has(role.id)) {
    return interaction.editReply({
      content: "You're already verified as **Citizen**. Enjoy the server.",
    });
  }

  try {
    await member.roles.add(role, "OXIDE verify");
  } catch (err) {
    return interaction.editReply({
      content:
        `Could not assign Citizen (bot role must be above Citizen): \`${err.message}\``,
    });
  }

  return interaction.editReply({
    content:
      "✅ Verified — you now have **Citizen**.\n" +
      "You can see announcements, general, help, and status.\n" +
      `Buy / redeem: ${config.siteUrl}/buy · Commands: \`/help\``,
  });
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 */
async function handleCommand(interaction, client) {
  const name = interaction.commandName;

  if (name === "website" || name === "site" || name === "web") {
    return interaction.reply({
      embeds: [buildWebsiteEmbed()],
      components: websiteRows(),
    });
  }

  if (name === "help") {
    const embed = new EmbedBuilder()
      .setTitle("OXIDE Bot")
      .setColor(0xe6852e)
      .setDescription(
        [
          "**Everyone / Citizen**",
          "`/verify` — Unlock the server (Citizen role)",
          "`/ping` — Bot latency",
          "`/website` · `/site` · `/web` — Official site + quick links",
          "`/status` — Gate API + downloads + products",
          "`/products` — Plans & gamepass links",
          "`/download` — Oxide.exe link",
          "`/key-redeem` — How to redeem a key",
          "`/redeem` · `/bind` — Redeem/link `OXIDE-…`",
          "`/link-roblox` — Link Roblox username (recovers claimed keys)",
          "`/mykey` · `/license` · `/recover` — Show / recover saved key",
          "`/roblox-version` — Latest Windows client",
          "`/help` — This list",
          "",
          "**Staff+ only**",
          "`/key-create` — Mint license keys",
          "`/key-revoke` — Ban a key",
          "`/hwid-reset` — Clear machine bind",
          "`/key-recover` — Recover by Roblox / Discord",
          "`/role` — Assign Citizen / Customer / …",
          "`/setup-server` — Verify gate + pro layout (Admin)",
          "",
          `Site: ${config.siteUrl}`,
          `Status page: ${config.siteUrl}/status`,
          `Invite: ${config.discordInvite}`,
        ].join("\n")
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "ping") {
    const sent = await interaction.reply({
      content: "Pinging…",
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });
    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    return interaction.editReply({
      content: `Pong — roundtrip **${roundtrip}ms** · websocket **${Math.round(client.ws.ping)}ms**`,
    });
  }

  if (name === "verify") {
    return grantCitizen(interaction);
  }

  if (name === "setup-server" || name === "setup") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "Administrator permission required.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const summary = await setupGuild(interaction.guild, {
      siteUrl: config.siteUrl,
      discordInvite: config.discordInvite,
    });
    try {
      await syncStatusChannel(client, config.guildId);
    } catch {
      /* status channel may be empty until first poll */
    }
    return interaction.editReply({
      content:
        "**OXIDE layout ready** (idempotent — existing names reused).\n\n" +
        `Roles created: ${summary.rolesCreated.join(", ") || "none"}\n` +
        `Roles existing: ${summary.rolesExisting.join(", ") || "none"}\n` +
        `Channels created: ${summary.channelsCreated.join(", ") || "none"}\n` +
        `Channels existing: ${summary.channelsExisting.join(", ") || "none"}\n` +
        (summary.notes?.length ? `\nNotes:\n• ${summary.notes.join("\n• ")}\n` : "") +
        "\n**Next:** drag the bot role **above** Citizen in Server Settings → Roles.\n" +
        "New members only see VERIFY until they click the button.\n" +
        "Upload **branding/oxide-icon.png** as the server icon.",
    });
  }

  if (name === "status") {
    await interaction.deferReply();
    try {
      const snap = await collectStatusSnapshot();
      const embed = buildStatusEmbed(snap);
      // Best-effort refresh of #status
      syncStatusChannel(client, config.guildId).catch(() => {});
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      try {
        const health = await fetchHealth(config.apiBaseUrl);
        return interaction.editReply({
          content: `Partial status — gate ${health.ok ? "ok" : "down"} (${health.ms}ms). Error: \`${err.message}\``,
        });
      } catch (err2) {
        return interaction.editReply({
          content: `Gate unreachable: \`${err2.message}\`\n\`${config.apiBaseUrl}/api/health\``,
        });
      }
    }
  }

  if (name === "products") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await fetchProducts(config.apiBaseUrl);
      if (!result.ok) {
        return interaction.editReply({
          content: `Could not load products (HTTP ${result.status}).`,
        });
      }
      const list = result.body.products || [];
      const embed = new EmbedBuilder()
        .setTitle("OXIDE products")
        .setColor(0xe6852e)
        .setDescription(
          list.length
            ? list
                .map((p) => {
                  const flag = p.configured ? "✅" : "⚠️";
                  const link = p.buyUrl ? `[Buy](${p.buyUrl})` : "_no buy URL_";
                  return `${flag} **${p.name || p.plan}** — ${link}`;
                })
                .join("\n")
            : "No products returned."
        )
        .addFields({
          name: "Redeem",
          value: `After purchase: ${config.siteUrl}/buy or \`/redeem\` here.`,
        })
        .setFooter({
          text: result.body.demo ? "DEMO mode on gate-api" : "Live catalog",
        });
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ content: `Failed: \`${err.message}\`` });
    }
  }

  if (name === "key-redeem") {
    const embed = new EmbedBuilder()
      .setTitle("How to redeem an OXIDE key")
      .setColor(0xe6852e)
      .setDescription(
        [
          "**Already have a key?** Run `/redeem` or `/bind` (or `/mykey` → **Link my key**).",
          "",
          "1. Buy a plan on the site or Roblox gamepass (if you need a new key).",
          "2. Claim / receive your `OXIDE-…` key.",
          "3. Run `/redeem key:OXIDE-…` **in Discord** (this links the key).",
          "4. Later: `/mykey` or `/license` shows your saved key + time left.",
          "5. Download Oxide.exe and paste the key when asked.",
          "",
          "⚠️ Redeeming only on the website does **not** auto-link Discord — you still need one `/redeem` here.",
          "",
          `Site redeem: ${config.siteUrl}/key`,
          `Buy: ${config.siteUrl}/buy`,
          `Download: ${downloadUrl()}`,
        ].join("\n")
      );
    return interaction.reply({
      embeds: [embed],
      components: [downloadRow()],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (name === "download") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const linked = getLicense(interaction.user.id);
    const allowed =
      Boolean(linked?.key) ||
      hasCustomerAccess(interaction.member) ||
      isCitizen(interaction.member);

    // Citizens get the public download link; key paste still required in EXE
    if (!allowed) {
      return interaction.editReply({
        content:
          "Verify first with `/verify` (or the button in #verify), then run `/download` again.\n" +
          "Customers: `/redeem key:OXIDE-…` unlocks Customer chat.",
      });
    }

    const dl = downloadUrl(linked?.downloadUrl);
    const embed = new EmbedBuilder()
      .setTitle("Download Oxide.exe")
      .setColor(0xe6852e)
      .setDescription(
        "**Paste your key into Oxide.exe when it asks.**\n" +
          (linked?.key
            ? `Linked key: \`${linked.key}\``
            : "No key linked yet — buy/claim then `/redeem`, or paste a key you already have.")
      )
      .addFields({ name: "Direct link", value: `[Oxide.exe](${dl})` });

    return interaction.editReply({
      embeds: [embed],
      components: [downloadRow(dl)],
    });
  }

  if (name === "redeem" || name === "bind") {
    const rawKey = interaction.options.getString("key", true).trim();
    if (!rawKey) {
      return interaction.reply({
        content: "Provide a license key.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return runRedeemFlow(interaction, rawKey);
  }

  if (name === "mykey" || name === "license") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let license = null;
    let fromApi = false;

    if (config.adminSecret) {
      try {
        const apiResult = await fetchLicenseByDiscord({
          apiBaseUrl: config.apiBaseUrl,
          adminSecret: config.adminSecret,
          discordUserId: interaction.user.id,
        });
        if (apiResult.ok && apiResult.body?.key) {
          license = apiResult.body;
          fromApi = true;
        } else if (apiResult.body?.key && apiResult.body?.error === "expired") {
          license = apiResult.body;
          fromApi = true;
        }
      } catch {
        /* fall through to local cache */
      }
    }

    if (!license?.key) {
      const linked = getLicense(interaction.user.id);
      if (linked?.key) {
        // Local cache hit — try to re-bind on API so DB has the Discord link
        try {
          const linkedResult = await linkDiscordKey({
            apiBaseUrl: config.apiBaseUrl,
            key: linked.key,
            discordUserId: interaction.user.id,
          });
          if (linkedResult.ok && linkedResult.body?.key) {
            license = linkedResult.body;
            fromApi = true;
          } else {
            license = linked;
          }
        } catch {
          license = linked;
        }
      }
    }

    if (!license?.key) {
      return interaction.editReply(noKeyLinkedPayload());
    }

    // Refresh local cache from authoritative API/body
    setLicense(interaction.user.id, {
      key: license.key,
      plan: license.plan,
      planId: license.planId,
      expires: license.expires ?? null,
      downloadUrl: downloadUrl(license.downloadUrl),
      status: license.status,
      remainingLabel: license.remainingLabel,
      daysRemaining: license.daysRemaining,
      redeemedAt: new Date().toISOString(),
    });

    const embed = buildRedeemEmbed({
      title: "Your OXIDE license",
      key: license.key,
      plan: license.plan,
      expires: license.expires,
      downloadUrl: license.downloadUrl,
      alreadyActive: true,
      status: license.status,
      remainingLabel: license.remainingLabel,
      daysRemaining: license.daysRemaining,
      reveal: false,
    });

    const reply = {
      embeds: [embed],
      components: licenseRows({
        download: license.downloadUrl,
        discordUserId: interaction.user.id,
        reveal: false,
      }),
    };
    if (!fromApi) {
      reply.content =
        "_Showing cached link — API lookup unavailable; key still on this bot._";
    } else if (license.recoveryPath === "roblox_link" || license.robloxUsername) {
      reply.content = `Recovered via Roblox @${license.robloxUsername || "linked"} · saved on Discord.`;
    }
    return interaction.editReply(reply);
  }

  if (name === "link-roblox") {
    const robloxUsername = interaction.options.getString("username", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await linkRobloxIdentity({
        apiBaseUrl: config.apiBaseUrl,
        discordUserId: interaction.user.id,
        robloxUsername,
      });
      if (!result.ok) {
        return interaction.editReply({
          content: `❌ ${result.body?.message || `Link failed (HTTP ${result.status})`}`,
        });
      }
      const body = result.body;
      await ensureCitizenRole(interaction);
      if (body.keysLinked > 0 && body.keys?.[0]) {
        // Refresh license view from API
        let license = null;
        if (config.adminSecret) {
          const apiResult = await fetchLicenseByDiscord({
            apiBaseUrl: config.apiBaseUrl,
            adminSecret: config.adminSecret,
            discordUserId: interaction.user.id,
          });
          if (apiResult.body?.key) license = apiResult.body;
        }
        if (license?.key) {
          setLicense(interaction.user.id, {
            key: license.key,
            plan: license.plan,
            planId: license.planId,
            expires: license.expires ?? null,
            downloadUrl: downloadUrl(license.downloadUrl),
            status: license.status,
            remainingLabel: license.remainingLabel,
            daysRemaining: license.daysRemaining,
            redeemedAt: new Date().toISOString(),
          });
          const embed = buildRedeemEmbed({
            title: "Roblox linked — key recovered",
            key: license.key,
            plan: license.plan,
            expires: license.expires,
            downloadUrl: license.downloadUrl,
            alreadyActive: true,
            status: license.status,
            remainingLabel: license.remainingLabel,
            daysRemaining: license.daysRemaining,
            reveal: true,
          });
          return interaction.editReply({
            content:
              `✅ Linked Roblox **@${body.robloxUsername}** to Discord.\n` +
              `Recovered **${body.keysLinked}** license(s). Future claims auto-DM this Discord.`,
            embeds: [embed],
            components: licenseRows({
              download: license.downloadUrl,
              discordUserId: interaction.user.id,
              reveal: true,
            }),
          });
        }
      }
      return interaction.editReply({
        content:
          `✅ Linked Roblox **@${body.robloxUsername}** to your Discord.\n` +
          (body.keysLinked
            ? `Attached ${body.keysLinked} key(s). Use \`/mykey\` to view.`
            : `No claimed keys yet — buy + claim on ${config.siteUrl}/buy (same Roblox name), or \`/redeem\` a key you already have.\n` +
              "After you claim, the key auto-attaches and we try to DM you."),
      });
    } catch (err) {
      return interaction.editReply({
        content: `Gate unreachable: \`${err.message}\``,
      });
    }
  }

  if (name === "recover") {
    const robloxOpt = interaction.options.getString("roblox")?.trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (robloxOpt) {
        const linked = await linkRobloxIdentity({
          apiBaseUrl: config.apiBaseUrl,
          discordUserId: interaction.user.id,
          robloxUsername: robloxOpt,
        });
        if (!linked.ok) {
          return interaction.editReply({
            content: `❌ ${linked.body?.message || "Could not link Roblox."}`,
          });
        }
      }

      if (!config.adminSecret) {
        return interaction.editReply({
          content:
            "`ADMIN_SECRET` missing on bot — cannot look up the API store. Use `/redeem` with your key.",
        });
      }

      const apiResult = await fetchLicenseByDiscord({
        apiBaseUrl: config.apiBaseUrl,
        adminSecret: config.adminSecret,
        discordUserId: interaction.user.id,
      });

      if (apiResult.body?.key) {
        const license = apiResult.body;
        setLicense(interaction.user.id, {
          key: license.key,
          plan: license.plan,
          planId: license.planId,
          expires: license.expires ?? null,
          downloadUrl: downloadUrl(license.downloadUrl),
          status: license.status,
          remainingLabel: license.remainingLabel,
          daysRemaining: license.daysRemaining,
          redeemedAt: new Date().toISOString(),
        });
        await ensureCitizenRole(interaction);
        await assignCustomerRole(interaction);
        const embed = buildRedeemEmbed({
          title: "Recovered OXIDE license",
          key: license.key,
          plan: license.plan,
          expires: license.expires,
          downloadUrl: license.downloadUrl,
          alreadyActive: true,
          status: license.status,
          remainingLabel: license.remainingLabel,
          daysRemaining: license.daysRemaining,
          reveal: true,
        });
        return interaction.editReply({
          content:
            license.robloxUsername
              ? `Recovered via Roblox @${license.robloxUsername}.`
              : "Recovered from your Discord link.",
          embeds: [embed],
          components: licenseRows({
            download: license.downloadUrl,
            discordUserId: interaction.user.id,
            reveal: true,
          }),
        });
      }

      return interaction.editReply({
        ...noKeyLinkedPayload(),
        content:
          apiResult.body?.message ||
          "Nothing to recover yet — link Roblox or paste your key.",
      });
    } catch (err) {
      return interaction.editReply({
        content: `Gate unreachable: \`${err.message}\``,
      });
    }
  }

  if (name === "roblox-version") {
    await interaction.deferReply();
    try {
      const result = await syncRobloxVersion(client, config.guildId, { forceAnnounce: false });
      return interaction.editReply({
        content: result.changed
          ? `Updated — **new** version \`${result.version}\` (was \`${result.previous}\`).`
          : result.first
            ? `Posted first known version \`${result.version}\` in #roblox-versions.`
            : `Still current: \`${result.version}\` (embed refreshed).`,
        embeds: [result.embed],
      });
    } catch (err) {
      try {
        const remote = await fetchRobloxWindowsVersion();
        const embed = buildEmbed({
          version: remote.version,
          clientVersionUpload: remote.clientVersionUpload,
          changed: true,
          localBuild: readLocalClientVersion(),
          source: remote.source,
        });
        return interaction.editReply({
          content: `Fetched version but channel update failed: \`${err.message}\``,
          embeds: [embed],
        });
      } catch (err2) {
        return interaction.editReply({ content: `Failed: \`${err2.message}\`` });
      }
    }
  }

  if (name === "role") {
    if (!isStaffPlus(interaction.member)) {
      return interaction.reply({
        content: "Staff+ only.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const action = interaction.options.getString("action", true);
    const targetUser = interaction.options.getUser("user", true);
    const roleName = interaction.options.getString("role", true);

    const elevated = ["Admin", "Staff"];
    if (elevated.includes(roleName)) {
      const isOwnerOrAdmin =
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.member.roles.cache.some((r) =>
          ["Owner", "Admin"].includes(r.name)
        );
      if (!isOwnerOrAdmin) {
        return interaction.reply({
          content: "Only Owner/Admin can assign Staff or Admin.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const role = findRole(interaction.guild, roleName);
    if (!role) {
      return interaction.editReply({
        content: `Role **${roleName}** not found — run \`/setup-server\` first.`,
      });
    }
    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!member) {
      return interaction.editReply({ content: "User is not in this server." });
    }
    try {
      if (action === "add") {
        await member.roles.add(role, `OXIDE /role by ${interaction.user.tag}`);
        return interaction.editReply({
          content: `Added **${roleName}** to <@${member.id}>.`,
        });
      }
      await member.roles.remove(role, `OXIDE /role by ${interaction.user.tag}`);
      return interaction.editReply({
        content: `Removed **${roleName}** from <@${member.id}>.`,
      });
    } catch (err) {
      return interaction.editReply({
        content: `Failed (bot role must be above target role): \`${err.message}\``,
      });
    }
  }

  if (name === "key-create") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isStaffPlus(interaction.member)) {
      return interaction.editReply({ content: "Staff+ only." });
    }
    if (!config.adminSecret) {
      return interaction.editReply({
        content:
          "`ADMIN_SECRET` is not set on this bot (Render → **oxide-discord-bot-fra** → Environment). " +
          "It must match gate-api `ADMIN_SECRET`.",
      });
    }

    const plan = interaction.options.getString("plan") || "premium";
    const count = interaction.options.getInteger("count") || 1;
    const days = interaction.options.getInteger("days") ?? undefined;
    try {
      const result = await createKeys({
        apiBaseUrl: config.apiBaseUrl,
        adminSecret: config.adminSecret,
        plan,
        count,
        days,
      });
      if (!result.ok) {
        const detail =
          result.body?.message ||
          result.body?.error ||
          JSON.stringify(result.body ?? {});
        const hint =
          result.status === 401 || result.status === 403
            ? "\n\nLikely **ADMIN_SECRET mismatch** — copy the secret from Render **oxide-gate-api** → Environment into **oxide-discord-bot-fra**."
            : result.status === 0 || /abort|timeout|fetch/i.test(String(detail))
              ? `\n\nGate API may be cold/unreachable: \`${config.apiBaseUrl}\``
              : "";
        return interaction.editReply({
          content: `API error (HTTP ${result.status}): \`${String(detail).slice(0, 500)}\`${hint}`,
        });
      }
      const keys = result.body.keys || [];
      const list = keys.map((k) => `\`${k}\``).join("\n") || "(none)";
      await logToKeyLogs(interaction.guild, {
        title: "Keys created",
        color: 0xe6852e,
        description: `By <@${interaction.user.id}> · plan \`${plan}\` · count ${keys.length}`,
        fields: [{ name: "Keys", value: list.slice(0, 1000) }],
        timestamp: new Date().toISOString(),
      });
      return interaction.editReply({
        content:
          `Created **${keys.length}** key(s) · plan \`${plan}\`${days ? ` · ${days}d` : ""}\n${list}\n\n` +
          "DM buyers the key, or have them run `/redeem key:…` in the server.",
      });
    } catch (err) {
      return interaction.editReply({
        content:
          `Failed: \`${err.message}\`\n` +
          `API: \`${config.apiBaseUrl}\` — if this is a timeout, wait for gate-api wake and retry.`,
      });
    }
  }

  if (name === "key-revoke") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isStaffPlus(interaction.member)) {
      return interaction.editReply({ content: "Staff+ only." });
    }
    if (!config.adminSecret) {
      return interaction.editReply({
        content: "`ADMIN_SECRET` is not set on this bot.",
      });
    }
    const key = interaction.options.getString("key", true).trim();
    try {
      const result = await revokeKey({
        apiBaseUrl: config.apiBaseUrl,
        adminSecret: config.adminSecret,
        key,
      });
      if (!result.ok) {
        return interaction.editReply({
          content:
            result.body?.message ||
            `Revoke failed (HTTP ${result.status}).`,
        });
      }
      await logToKeyLogs(interaction.guild, {
        title: "Key revoked",
        color: 0xe74c3c,
        description: `By <@${interaction.user.id}>`,
        fields: [
          { name: "Key", value: `\`${result.body.key || key}\`` },
          { name: "Plan", value: result.body.plan || "—" },
        ],
        timestamp: new Date().toISOString(),
      });
      return interaction.editReply({
        content: `Revoked \`${result.body.key || key}\` (banned).`,
      });
    } catch (err) {
      return interaction.editReply({ content: `Failed: \`${err.message}\`` });
    }
  }

  if (name === "hwid-reset") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isStaffPlus(interaction.member)) {
      return interaction.editReply({ content: "Staff+ only." });
    }
    if (!config.adminSecret) {
      return interaction.editReply({
        content: "`ADMIN_SECRET` is not set on this bot.",
      });
    }
    const key = interaction.options.getString("key", true).trim();
    try {
      const result = await resetHwid({
        apiBaseUrl: config.apiBaseUrl,
        adminSecret: config.adminSecret,
        key,
      });
      if (!result.ok) {
        return interaction.editReply({
          content:
            result.body?.message ||
            `HWID reset failed (HTTP ${result.status}).`,
        });
      }
      await logToKeyLogs(interaction.guild, {
        title: "HWID reset",
        color: 0xe6852e,
        description: `By <@${interaction.user.id}>`,
        fields: [{ name: "Key", value: `\`${result.body.key || key}\`` }],
        timestamp: new Date().toISOString(),
      });
      return interaction.editReply({
        content: `HWID cleared for \`${result.body.key || key}\`. Next EXE launch binds a new machine.`,
      });
    } catch (err) {
      return interaction.editReply({ content: `Failed: \`${err.message}\`` });
    }
  }

  if (name === "key-recover") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isStaffPlus(interaction.member)) {
      return interaction.editReply({ content: "Staff+ only." });
    }
    if (!config.adminSecret) {
      return interaction.editReply({
        content: "`ADMIN_SECRET` is not set on this bot.",
      });
    }
    const roblox = interaction.options.getString("roblox")?.trim();
    const discordIdOpt = interaction.options.getString("discord_id")?.trim();
    const userOpt = interaction.options.getUser("user");
    const discordUserId = discordIdOpt || userOpt?.id || null;
    if (!roblox && !discordUserId) {
      return interaction.editReply({
        content: "Provide `roblox` and/or `user` / `discord_id`.",
      });
    }
    try {
      const result = await adminRecover({
        apiBaseUrl: config.apiBaseUrl,
        adminSecret: config.adminSecret,
        discordUserId: discordUserId || undefined,
        robloxUsername: roblox || undefined,
      });
      if (!result.ok) {
        // Try roblox-only lookup for staff display
        if (roblox) {
          const byRoblox = await fetchLicenseByRoblox({
            apiBaseUrl: config.apiBaseUrl,
            adminSecret: config.adminSecret,
            robloxUsername: roblox,
          });
          if (byRoblox.ok && byRoblox.body?.licenses?.length) {
            const lines = byRoblox.body.licenses
              .map(
                (l) =>
                  `\`${l.key}\` · ${l.plan} · ${l.status}` +
                  (l.discordUserId ? ` · discord \`${l.discordUserId}\`` : "")
              )
              .join("\n");
            return interaction.editReply({
              content:
                `Roblox @${byRoblox.body.robloxUsername} — **${byRoblox.body.count}** key(s):\n${lines}`,
            });
          }
        }
        return interaction.editReply({
          content:
            result.body?.message ||
            `Recover failed (HTTP ${result.status}).`,
        });
      }
      const body = result.body;
      if (body.licenses?.length) {
        const lines = body.licenses
          .map((l) => `\`${l.key}\` · ${l.plan} · ${l.status}`)
          .join("\n");
        return interaction.editReply({
          content:
            `Roblox @${body.robloxUsername} · discord \`${body.discordUserId || "—"}\`\n${lines}`,
        });
      }
      if (body.key) {
        return interaction.editReply({
          content:
            `Recovered \`${body.key}\` · ${body.plan || "—"} · ${body.status || "—"}` +
            (body.robloxUsername ? ` · Roblox @${body.robloxUsername}` : ""),
        });
      }
      return interaction.editReply({
        content: `OK: \`\`\`${JSON.stringify(body).slice(0, 1500)}\`\`\``,
      });
    } catch (err) {
      return interaction.editReply({ content: `Failed: \`${err.message}\`` });
    }
  }
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleButton(interaction) {
  if (interaction.customId === VERIFY_BUTTON_ID) {
    return grantCitizen(interaction);
  }

  if (interaction.customId === LINK_KEY_BUTTON_ID) {
    return interaction.showModal(linkKeyModal());
  }

  if (interaction.customId.startsWith(LICENSE_REVEAL_PREFIX)) {
    const ownerId = interaction.customId.slice(LICENSE_REVEAL_PREFIX.length);
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: "Only the license owner can reveal this key.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let license = null;
    if (config.adminSecret) {
      try {
        const apiResult = await fetchLicenseByDiscord({
          apiBaseUrl: config.apiBaseUrl,
          adminSecret: config.adminSecret,
          discordUserId: interaction.user.id,
        });
        if (apiResult.body?.key) license = apiResult.body;
      } catch {
        /* local fallback */
      }
    }
    if (!license?.key) {
      license = getLicense(interaction.user.id);
    }
    if (!license?.key) {
      return interaction.editReply(noKeyLinkedPayload());
    }

    const embed = buildRedeemEmbed({
      title: "Your OXIDE license (revealed)",
      key: license.key,
      plan: license.plan,
      expires: license.expires,
      downloadUrl: license.downloadUrl,
      alreadyActive: true,
      status: license.status,
      remainingLabel: license.remainingLabel,
      daysRemaining: license.daysRemaining,
      reveal: true,
    });
    return interaction.editReply({
      embeds: [embed],
      components: [downloadRow(license.downloadUrl)],
    });
  }
}

/**
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleModal(interaction) {
  if (interaction.customId !== LINK_KEY_MODAL_ID) return;
  const rawKey = interaction.fields.getTextInputValue(LINK_KEY_INPUT_ID);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return runRedeemFlow(interaction, rawKey);
}

module.exports = {
  commandData,
  handleCommand,
  handleButton,
  handleModal,
  isStaffPlus,
  isCitizen,
  grantCitizen,
};
