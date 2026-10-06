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
  fetchLeaderboard,
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
  issueAdminLogin,
} = require("./gate");
const { collectStatusSnapshot, buildStatusEmbed, syncStatusChannel } = require("./status");
const { getLicense, setLicense } = require("./licenses");
const { config } = require("./config");
const {
  fetchLatestRelease,
  fetchReleases,
  buildReleaseEmbed,
  releaseRows,
  fetchReleaseAttachment,
  announceLatestRelease,
} = require("./releases");
const { COLORS, brandEmbed, linkRow, unreachableEmbed } = require("./brand");

const DEFAULT_DOWNLOAD =
  "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

const STAFF_ONLY = "This command is limited to Staff and above.";

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
 * Website owner access: the Discord guild owner, or an id listed in
 * OWNER_DISCORD_IDS. Roles are deliberately ignored — they can be assigned.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
function isSiteOwner(interaction) {
  const id = interaction.user?.id;
  if (!id || !interaction.guild) return false;
  if (interaction.guildId !== config.guildId) return false;
  if (interaction.guild.ownerId === id) return true;
  return config.ownerDiscordIds.includes(id);
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
  return brandEmbed({
    title,
    color: rem.expired ? COLORS.danger : COLORS.brand,
    footer: "Keep this key private — staff will never ask for it.",
    description: reveal
      ? "**Paste this key into Oxide.exe when it asks.**\n" +
        "Download the EXE, launch it, and enter the key below."
      : "**Your license is linked to this Discord.**\n" +
        "Key is masked — tap **Reveal key** if you need the full string.",
  }).addFields(fields);
}

function downloadRow(url) {
  return linkRow([
    ["Download Oxide.exe", downloadUrl(url)],
    ["Changelog", `${config.siteUrl}/changelog`],
    ["Status", `${config.siteUrl}/status`],
  ]);
}

/** Public site link buttons: Buy / Get key / Status / Offsets / Changelog */
function websiteRows() {
  const base = config.siteUrl;
  return [
    linkRow([
      ["Buy", `${base}/buy`],
      ["Get key", `${base}/key`],
      ["Status", `${base}/status`],
      ["Offsets", `${base}/offsets`],
      ["Changelog", `${base}/changelog`],
    ]),
  ];
}

function buildWebsiteEmbed() {
  const base = config.siteUrl;
  return brandEmbed({
    title: "OXIDE website",
    footer: "Aliases: /website · /site · /web",
    description:
      `Official site: **[${base.replace(/^https?:\/\//, "")}](${base})**\n` +
      "Buy a plan, claim your key, check live status, or pull the public offsets.",
  })
    .setURL(base)
    .addFields(
      { name: "Buy", value: `[Plans & pricing](${base}/buy)`, inline: true },
      { name: "Get a key", value: `[Redeem](${base}/key)`, inline: true },
      { name: "Status", value: `[Live health](${base}/status)`, inline: true },
      { name: "Offsets", value: `[Public API](${base}/offsets)`, inline: true },
      { name: "Changelog", value: `[Releases](${base}/changelog)`, inline: true },
      { name: "Features", value: `[Full list](${base}/features)`, inline: true }
    );
}

/** Public offsets API links (mirrors the site's Offsets page downloads). */
function buildOffsetsPayload() {
  const api = config.apiBaseUrl;
  const embed = brandEmbed({
    title: "OXIDE public offsets",
    footer: "Free to use · CORS open on GET",
    description:
      "Live Roblox client offsets from the OXIDE dumper, served as a public API.\n" +
      `Browse and search them on the site: ${config.siteUrl}/offsets`,
  })
    .setURL(`${config.siteUrl}/offsets`)
    .addFields(
      {
        name: "Downloads",
        value: [
          `[offsets.json](${api}/api/offsets) — OXIDE API shape`,
          `[offsets.raw.json](${api}/api/offsets/raw) — decimal map`,
          `[offsets.hex.json](${api}/api/offsets/hex) — hex map`,
          `[offsets.hpp](${api}/api/offsets.hpp) — C++ header`,
          `[offsets.cs](${api}/api/offsets.cs) — C#`,
          `[offsets.txt](${api}/api/offsets.txt) — plain text`,
        ].join("\n"),
      },
      {
        name: "Developer API",
        value: `\`GET ${api}/api/offsets\`\n\`GET ${api}/api/offsets/raw\``,
      }
    );
  return {
    embeds: [embed],
    components: [
      linkRow([
        ["Browse offsets", `${config.siteUrl}/offsets`],
        ["offsets.hpp", `${api}/api/offsets.hpp`],
        ["offsets.json", `${api}/api/offsets`],
      ]),
    ],
  };
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
  const embed = brandEmbed({ title: "No OXIDE key linked to Discord", footer: false })
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
    .setFooter({ text: "OXIDE · Linking is private — only you see this." });

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
      content: "Paste your full license key — it starts with `OXIDE-`.",
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
    return interaction.editReply({ embeds: [unreachableEmbed("redeem that key", err)] });
  }

  if (!result.ok) {
    const msg =
      result.body?.message ||
      result.body?.error ||
      `Redeem failed (HTTP ${result.status})`;
    return interaction.editReply({
      embeds: [
        brandEmbed({
          title: "Could not redeem that key",
          color: COLORS.danger,
          description:
            `${msg}\n\n` +
            "• Check you pasted the **full** key, including `OXIDE-`.\n" +
            "• Keys already active on the site still link here with `/redeem`.\n" +
            "• Claimed on Roblox? Try `/link-roblox` instead.",
        }),
      ],
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
        "✅ **Key linked to your Discord.** Check your DMs for the key, plan, and download.\n" +
        `-# ${roleNote} · Recover anytime with \`/mykey\` · Paste the key into Oxide.exe when it asks.`,
    });
  }

  return interaction.editReply({
    content:
      "✅ **Key linked to your Discord.** Your DMs are closed, so here it is privately instead.\n" +
      `-# ${roleNote} · Recover anytime with \`/mykey\`.`,
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
    .setName("leaderboard")
    .setDescription("How many people have used Oxide, and when"),
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
    .setName("offsets")
    .setDescription("Public Roblox offsets: JSON, C++ header, C#, and API links"),
  new SlashCommandBuilder()
    .setName("update")
    .setDescription("Latest Oxide.exe version, what changed, and download"),
  new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("Oxide.exe changelog (latest, or a specific version)")
    .addStringOption((o) =>
      o.setName("version").setDescription("e.g. 1.1.0 (omit for latest)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("release-announce")
    .setDescription("Post the latest Oxide release in the updates channel (Staff+)")
    .addBooleanOption((o) =>
      o.setName("force").setDescription("Re-post even if already announced").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("admin-login")
    .setDescription("Owner only: one-time sign-in link for the website admin panel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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

  if (name === "update" || name === "changelog") {
    await interaction.deferReply();
    const want = name === "changelog" ? interaction.options.getString("version") : null;
    let release = null;
    let history = [];
    if (want) {
      history = await fetchReleases();
      release = history.find((r) => r.version === want.replace(/^v/i, "").trim()) || null;
      if (!release) {
        return interaction.editReply({
          content: `No release \`${want}\`. Known: ${history.map((r) => `\`${r.version}\``).join(", ") || "none"}`,
        });
      }
    } else {
      release = await fetchLatestRelease();
      if (name === "changelog") history = await fetchReleases();
    }
    if (!release) {
      return interaction.editReply({
        content: `Could not load releases from the API. Changelog: ${config.siteUrl}/changelog`,
      });
    }
    const embed = buildReleaseEmbed(release);
    const older = history.filter((r) => r.version !== release.version).slice(0, 5);
    if (older.length) {
      embed.addFields({
        name: "Earlier versions",
        value: older
          .map((r) => `\`v${r.version}\`${r.title ? ` — ${r.title}` : ""}`)
          .join("\n")
          .slice(0, 1024),
      });
    }
    const latest = name === "update" || !want;
    const file = latest ? await fetchReleaseAttachment(release) : null;
    return interaction.editReply({
      embeds: [embed],
      components: releaseRows(release),
      files: file ? [file] : [],
    });
  }

  if (name === "release-announce") {
    if (!isStaffPlus(interaction.member)) {
      return interaction.reply({ content: STAFF_ONLY, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await announceLatestRelease(client, {
      force: interaction.options.getBoolean("force") === true,
    });
    if (!result.ok) {
      return interaction.editReply({ content: `Not announced: ${result.message || result.error}` });
    }
    return interaction.editReply({
      content: result.announced
        ? `Announced **v${result.version}** in <#${result.channelId}>.`
        : `**v${result.version}** was already announced${result.channelId ? ` in <#${result.channelId}>` : ""}. Use \`force:true\` to re-post.`,
    });
  }

  if (name === "offsets") {
    return interaction.reply(buildOffsetsPayload());
  }

  if (name === "admin-login") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!isSiteOwner(interaction)) {
      console.warn(`[admin-login] refused ${interaction.user.tag} (${interaction.user.id})`);
      return interaction.editReply({ content: "This command is limited to the server owner." });
    }
    if (!config.adminSecret) {
      return interaction.editReply({ content: "`ADMIN_SECRET` is not set on this bot." });
    }
    try {
      const result = await issueAdminLogin({
        apiBaseUrl: config.apiBaseUrl,
        adminSecret: config.adminSecret,
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
      });
      if (!result.ok || !result.body?.code) {
        return interaction.editReply({
          content: `Could not create a login link (HTTP ${result.status}): \`${String(
            result.body?.message || result.body?.error || "unknown"
          ).slice(0, 300)}\``,
        });
      }
      const loginUrl = `${config.siteUrl}/admin#code=${encodeURIComponent(result.body.code)}`;
      return interaction.editReply({
        content:
          "One-time admin sign-in link — expires in **5 minutes** and works once. " +
          "Do not share it.",
        components: [linkRow([["Open admin panel", loginUrl]])],
      });
    } catch (err) {
      return interaction.editReply({
        content: `Failed: \`${err.message}\` — gate-api may be waking up, try again in a minute.`,
      });
    }
  }

  if (name === "help") {
    const embed = brandEmbed({
      title: "OXIDE bot commands",
      description: "Most replies are private — only you see them.",
    }).addFields(
      {
        name: "Get started",
        value: [
          "`/verify` — Unlock the server (Citizen role)",
          "`/products` — Plans and Roblox gamepass links",
          "`/key-redeem` — How redeeming works, step by step",
        ].join("\n"),
      },
      {
        name: "Your license",
        value: [
          "`/redeem` · `/bind` — Link an `OXIDE-…` key to Discord",
          "`/link-roblox` — Link your Roblox name (recovers claimed keys)",
          "`/mykey` · `/license` · `/recover` — Show or recover your key",
          "`/download` — Latest Oxide.exe",
        ].join("\n"),
      },
      {
        name: "Info",
        value: [
          "`/update` · `/changelog` — What changed in each version",
          "`/status` — Live API, download, and bot health",
          "`/leaderboard` — How many people have used Oxide, and when",
          "`/offsets` — Public offsets API and file downloads",
          "`/roblox-version` — Latest Roblox Windows client",
          "`/website` · `/site` · `/web` — Site quick links",
          "`/ask` — Ask the OXIDE AI (in the help channel or DM the bot)",
          "`/ping` — Bot latency",
        ].join("\n"),
      }
    );
    if (isStaffPlus(interaction.member)) {
      embed.addFields({
        name: "Staff",
        value: [
          "`/key-create` — Mint license keys",
          "`/key-revoke` — Ban a key",
          "`/hwid-reset` — Clear machine binding",
          "`/key-recover` — Look up by Roblox / Discord",
          "`/role` — Add or remove OXIDE roles",
          "`/release-announce` — Post the latest release",
          "`/setup-server` — Rebuild roles and channels (Admin)",
          "`/admin-login` — Website license admin (server owner only)",
        ].join("\n"),
      });
    }
    return interaction.reply({
      embeds: [embed],
      components: [
        linkRow([
          ["Website", config.siteUrl],
          ["Get a key", `${config.siteUrl}/key`],
          ["Status", `${config.siteUrl}/status`],
          ["Invite", config.discordInvite],
        ]),
      ],
      flags: MessageFlags.Ephemeral,
    });
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
        return interaction.editReply({ embeds: [unreachableEmbed("load system status", err2)] });
      }
    }
  }

  if (name === "leaderboard") {
    await interaction.deferReply();
    try {
      const result = await fetchLeaderboard(config.apiBaseUrl);
      if (!result.ok) {
        return interaction.editReply({
          embeds: [unreachableEmbed("load the leaderboard", `HTTP ${result.status}`)],
        });
      }
      const body = result.body || {};
      const count = Number(body.count) || 0;
      const people = Array.isArray(body.people) ? body.people : [];
      const stamp = (iso) => {
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return "—";
        const sec = Math.floor(t / 1000);
        return `<t:${sec}:F> (<t:${sec}:R>)`;
      };
      const recent = people.slice(0, 8);
      const lines = recent.length
        ? recent
            .map((p) => {
              const label =
                String(p.name || p.username || "Player")
                  .replace(/[*_`]/g, "")
                  .slice(0, 32) || "Player";
              return `**${label}** — last ${stamp(p.lastSeen)}`;
            })
            .join("\n")
        : "No one has checked in yet.";
      const extra =
        people.length > recent.length ? `\n\n+${people.length - recent.length} more on the site.` : "";
      const embed = brandEmbed({
        title: "OXIDE leaderboard",
        description:
          count === 1
            ? "**1 person** has used Oxide."
            : `**${count} people** have used Oxide.`,
      })
        .setURL(`${config.siteUrl}/leaderboard`)
        .addFields(
          {
            name: "Last activity",
            value: body.lastActivity ? stamp(body.lastActivity) : "—",
          },
          {
            name: "Recent",
            value: (lines + extra).slice(0, 1024),
          }
        );
      return interaction.editReply({
        embeds: [embed],
        components: [
          linkRow([
            ["Leaderboard", `${config.siteUrl}/leaderboard`],
            ["Status", `${config.siteUrl}/status`],
          ]),
        ],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [unreachableEmbed("load the leaderboard", err)] });
    }
  }

  if (name === "products") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await fetchProducts(config.apiBaseUrl);
      if (!result.ok) {
        return interaction.editReply({
          embeds: [unreachableEmbed("load the product list", `HTTP ${result.status}`)],
        });
      }
      const list = result.body.products || [];
      const embed = brandEmbed({
        title: "OXIDE plans",
        footer: result.body.demo ? "Demo catalog" : "Live catalog",
        description:
          list.length
            ? list
                .map((p) => {
                  const flag = p.configured ? "✅" : "⚠️";
                  const link = p.buyUrl ? `[Buy on Roblox](${p.buyUrl})` : "_not available yet_";
                  return `${flag} **${p.name || p.plan}** — ${link}`;
                })
                .join("\n")
            : "No plans are listed right now — check back shortly.",
      })
        .setURL(`${config.siteUrl}/buy`)
        .addFields({
          name: "After you buy",
          value:
            `1. Claim your key at ${config.siteUrl}/buy with your Roblox username\n` +
            "2. Run `/link-roblox` or `/redeem` here so `/mykey` can recover it",
        });
      return interaction.editReply({
        embeds: [embed],
        components: [linkRow([["Compare plans", `${config.siteUrl}/buy`]])],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [unreachableEmbed("load the product list", err)] });
    }
  }

  if (name === "key-redeem") {
    const embed = brandEmbed({
      title: "How to redeem an OXIDE key",
      description:
        "**Already have a key?** Run `/redeem` or `/bind` (or `/mykey` → **Link my key**).",
    }).addFields(
      {
        name: "Steps",
        value: [
          "1. Buy a plan on the site or via Roblox gamepass.",
          "2. Claim your `OXIDE-…` key.",
          "3. Run `/redeem key:OXIDE-…` **here** — this links it to Discord.",
          "4. Download Oxide.exe and paste the key when asked.",
          "5. Later: `/mykey` shows your saved key and time left.",
        ].join("\n"),
      },
      {
        name: "Heads up",
        value:
          "Redeeming only on the website does **not** link Discord — run `/redeem` here once.",
      },
      {
        name: "Links",
        value: `[Redeem on site](${config.siteUrl}/key) · [Buy](${config.siteUrl}/buy) · [Download](${downloadUrl()})`,
      }
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
        embeds: [
          brandEmbed({
            title: "Verify to download",
            description:
              "Click **Verify** in #verify (or run `/verify`), then run `/download` again.\n" +
              "Already bought? `/redeem key:OXIDE-…` also unlocks Customer chat.",
          }),
        ],
      });
    }

    const release = await fetchLatestRelease().catch(() => null);
    const dl = release?.downloadUrl || downloadUrl(linked?.downloadUrl);
    const embed = brandEmbed({
      title: release ? `Oxide.exe v${release.version}` : "Download Oxide.exe",
      description:
        "1. Download the EXE below.\n" +
        "2. Close any older build that is still running.\n" +
        "3. Launch it and paste your key when it asks.",
    })
      .setURL(`${config.siteUrl}/changelog`)
      .addFields(
        {
          name: "Your key",
          value: linked?.key
            ? `\`${maskKey(linked.key)}\` · \`/mykey\` to reveal`
            : "Not linked yet — `/redeem` a key or `/link-roblox`",
          inline: true,
        },
        { name: "Direct link", value: `[Oxide.exe](${dl})`, inline: true }
      );
    if (release) {
      embed.addFields({
        name: "What's new",
        value: `\`v${release.version}\`${release.title ? ` — ${release.title}` : ""} · \`/changelog\` for details`,
      });
    }
    const file = release ? await fetchReleaseAttachment(release) : null;
    if (file) {
      embed.addFields({
        name: "Attached",
        value: `\`Oxide.exe\` v${release.version} · sha256 \`${String(release.sha256).slice(0, 12)}\` (verified)`,
      });
    }

    return interaction.editReply({
      embeds: [embed],
      components: [downloadRow(dl)],
      files: file ? [file] : [],
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

    const release = await fetchLatestRelease().catch(() => null);
    const dl = release?.downloadUrl || downloadUrl(license.downloadUrl);

    const embed = buildRedeemEmbed({
      title: "Your OXIDE license",
      key: license.key,
      plan: license.plan,
      expires: license.expires,
      downloadUrl: dl,
      alreadyActive: true,
      status: license.status,
      remainingLabel: license.remainingLabel,
      daysRemaining: license.daysRemaining,
      reveal: false,
    });
    if (release) {
      embed.addFields({
        name: "Latest build",
        value: `\`v${release.version}\`${release.title ? ` — ${release.title}` : ""} · sha256 \`${String(release.sha256 || "").slice(0, 12)}\``,
      });
    }
    const file = release ? await fetchReleaseAttachment(release) : null;

    const reply = {
      embeds: [embed],
      components: licenseRows({
        download: dl,
        discordUserId: interaction.user.id,
        reveal: false,
      }),
      files: file ? [file] : [],
    };
    if (!fromApi) {
      reply.content =
        "-# Showing the copy saved on this bot — the license server did not answer, so time left may be out of date.";
    } else if (license.recoveryPath === "roblox_link" || license.robloxUsername) {
      reply.content = `-# Recovered via Roblox @${license.robloxUsername || "linked"} · saved to this Discord.`;
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
      return interaction.editReply({ embeds: [unreachableEmbed("link your Roblox account", err)] });
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
      return interaction.editReply({ embeds: [unreachableEmbed("recover your license", err)] });
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
        content: STAFF_ONLY,
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
      return interaction.editReply({ content: STAFF_ONLY });
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
          result.status === 401 || result.status === 403 || result.body?.error === "not_found"
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
        color: COLORS.brand,
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
      return interaction.editReply({ content: STAFF_ONLY });
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
        color: COLORS.danger,
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
      return interaction.editReply({ content: STAFF_ONLY });
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
        color: COLORS.brand,
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
      return interaction.editReply({ content: STAFF_ONLY });
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
