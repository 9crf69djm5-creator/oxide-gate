"use strict";

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
} = require("./gate");
const { collectStatusSnapshot, buildStatusEmbed, syncStatusChannel } = require("./status");
const { getLicense, setLicense } = require("./licenses");
const { config } = require("./config");

const DEFAULT_DOWNLOAD =
  "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

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

function formatExpiry(expires) {
  if (!expires) return "Lifetime / none";
  const t = Date.parse(expires);
  if (!Number.isFinite(t)) return String(expires);
  return `<t:${Math.floor(t / 1000)}:F> (<t:${Math.floor(t / 1000)}:R>)`;
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
  } = opts;
  const dl = downloadUrl(opts.downloadUrl);
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0xe6852e)
    .setDescription(
      "**Paste this key into Oxide.exe when it asks.**\n" +
        "Download the EXE, launch it, and enter the key below."
    )
    .addFields(
      { name: "Key", value: `\`${key}\``, inline: false },
      { name: "Plan", value: plan || "—", inline: true },
      { name: "Expires", value: formatExpiry(expires), inline: true },
      {
        name: "Status",
        value: alreadyActive ? "Already active (re-linked)" : "Activated",
        inline: true,
      },
      { name: "Download", value: `[Oxide.exe](${dl})`, inline: false }
    )
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
    .setDescription("Redeem an OXIDE license key and get download instructions")
    .addStringOption((o) =>
      o.setName("key").setDescription("Your OXIDE-… license key").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("mykey")
    .setDescription("Show your linked OXIDE license (after /redeem)"),
  new SlashCommandBuilder()
    .setName("license")
    .setDescription("Show your linked OXIDE license (alias of /mykey)"),
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

  if (name === "help") {
    const embed = new EmbedBuilder()
      .setTitle("OXIDE Bot")
      .setColor(0xe6852e)
      .setDescription(
        [
          "**Everyone / Citizen**",
          "`/verify` — Unlock the server (Citizen role)",
          "`/ping` — Bot latency",
          "`/status` — Gate API + downloads + products",
          "`/products` — Plans & gamepass links",
          "`/download` — Oxide.exe link",
          "`/key-redeem` — How to redeem a key",
          "`/redeem` — Redeem `OXIDE-…` → DM + Customer",
          "`/mykey` · `/license` — Your linked key",
          "`/roblox-version` — Latest Windows client",
          "`/help` — This list",
          "",
          "**Staff+ only**",
          "`/key-create` — Mint license keys",
          "`/key-revoke` — Ban a key",
          "`/hwid-reset` — Clear machine bind",
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
          "1. Buy a plan on the site or Roblox gamepass.",
          "2. Claim / receive your `OXIDE-…` key.",
          "3. Run `/redeem key:OXIDE-…` in this server (or redeem on the site).",
          "4. Download Oxide.exe and paste the key when asked.",
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

  if (name === "redeem") {
    const rawKey = interaction.options.getString("key", true).trim();
    if (!rawKey) {
      return interaction.reply({
        content: "Provide a license key.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let result;
    try {
      result = await redeemKey({
        apiBaseUrl: config.apiBaseUrl,
        key: rawKey,
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
      return interaction.editReply({ content: `❌ ${msg}` });
    }

    const body = result.body;
    const key = body.key || rawKey;
    const dl = downloadUrl(body.downloadUrl);

    setLicense(interaction.user.id, {
      key,
      plan: body.plan,
      planId: body.planId,
      expires: body.expires ?? null,
      downloadUrl: dl,
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
          "✅ Key redeemed. Check your **DMs** for the key, plan, and download button.\n" +
          `${roleNote}\n` +
          "Paste the key into **Oxide.exe** when it asks.",
      });
    }

    return interaction.editReply({
      content:
        "✅ Key redeemed (could not DM you — enable DMs from server members, or use this reply).\n" +
        `${roleNote}`,
      embeds: [embed],
      components: [row],
    });
  }

  if (name === "mykey" || name === "license") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const linked = getLicense(interaction.user.id);
    if (!linked?.key) {
      return interaction.editReply({
        content:
          "No license linked to your Discord yet.\n" +
          "Use `/redeem key:OXIDE-…` after you buy or receive a key.",
      });
    }
    const embed = buildRedeemEmbed({
      title: "Your OXIDE license",
      key: linked.key,
      plan: linked.plan,
      expires: linked.expires,
      downloadUrl: linked.downloadUrl,
      alreadyActive: true,
    });
    return interaction.editReply({
      embeds: [embed],
      components: [downloadRow(linked.downloadUrl)],
    });
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
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleButton(interaction) {
  if (interaction.customId === VERIFY_BUTTON_ID) {
    return grantCitizen(interaction);
  }
}

module.exports = {
  commandData,
  handleCommand,
  handleButton,
  isStaffPlus,
  isCitizen,
  grantCitizen,
};
