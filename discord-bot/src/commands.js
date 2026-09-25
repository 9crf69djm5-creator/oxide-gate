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
const { setupGuild, findRole, STAFF_PLUS } = require("./setup");
const { syncRobloxVersion, fetchRobloxWindowsVersion, buildEmbed, readLocalClientVersion } = require("./roblox");
const { fetchHealth, createKeys, redeemKey } = require("./gate");
const { getLicense, setLicense } = require("./licenses");
const { config } = require("./config");

const DEFAULT_DOWNLOAD =
  "https://oxide-gate-api.onrender.com/downloads/Oxide.exe";

/**
 * @param {import('discord.js').GuildMember} member
 */
function isStaffPlus(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return STAFF_PLUS.some((name) => {
    const role = findRole(member.guild, name);
    return role && member.roles.cache.has(role.id);
  });
}

/**
 * @param {import('discord.js').GuildMember|null} member
 */
function hasCustomerAccess(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
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

const commandData = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create OXIDE roles, categories, and channels (idempotent)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("roblox-version")
    .setDescription("Fetch latest Roblox Windows client version and update #roblox-versions"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Ping OXIDE gate API health"),
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
    .setName("download")
    .setDescription("Get the Oxide.exe download link (Customer+ or after /redeem)"),
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
          { name: "Member", value: "Member" },
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
          "`/setup` — Admin: roles + channel layout",
          "`/roblox-version` — Latest Windows client version",
          "`/status` — Gate API health",
          "`/redeem` — Redeem a license key → DM + Customer role",
          "`/mykey` · `/license` — Show your linked key",
          "`/download` — Oxide.exe download link",
          "`/key-create` — Staff+: create license keys",
          "`/role` — Staff+: add/remove Member, Customer, Reseller, Staff, Admin",
          "`/help` — This list",
          "",
          `Site: ${config.siteUrl}`,
          `Invite: ${config.discordInvite}`,
          `API: \`${config.apiBaseUrl}\``,
        ].join("\n")
      );
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (name === "setup") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "Administrator permission required.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const summary = await setupGuild(interaction.guild);
    return interaction.editReply({
      content:
        "**OXIDE layout ready** (idempotent — existing names reused).\n" +
        `Roles created: ${summary.rolesCreated.join(", ") || "none"}\n` +
        `Roles existing: ${summary.rolesExisting.join(", ") || "none"}\n` +
        `Channels created: ${summary.channelsCreated.join(", ") || "none"}\n` +
        `Channels existing: ${summary.channelsExisting.join(", ") || "none"}\n\n` +
        "Upload **branding/oxide-icon.png** as the Discord server icon (Server Settings → Overview).",
    });
  }

  if (name === "status") {
    await interaction.deferReply();
    try {
      const health = await fetchHealth(config.apiBaseUrl);
      const embed = new EmbedBuilder()
        .setTitle("Gate API status")
        .setColor(health.ok ? 0x2ecc71 : 0xe74c3c)
        .addFields(
          { name: "URL", value: health.url, inline: false },
          { name: "HTTP", value: String(health.status), inline: true },
          { name: "Latency", value: `${health.ms}ms`, inline: true },
          {
            name: "Body",
            value: "```json\n" + JSON.stringify(health.body ?? {}, null, 2).slice(0, 900) + "\n```",
          }
        );
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({
        content: `Gate unreachable: \`${err.message}\`\n\`${config.apiBaseUrl}/api/health\``,
      });
    }
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
          ? "Customer role missing — run `/setup`."
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

  if (name === "download") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const linked = getLicense(interaction.user.id);
    const allowed =
      Boolean(linked?.key) || hasCustomerAccess(interaction.member);

    if (!allowed) {
      return interaction.editReply({
        content:
          "Download is for **Customer** (or Staff+) after redeem.\n" +
          "Run `/redeem key:OXIDE-…` first, then try `/download` again.",
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
            : "Use `/mykey` if you redeemed earlier, or `/redeem` with your key.")
      )
      .addFields({ name: "Direct link", value: `[Oxide.exe](${dl})` });

    return interaction.editReply({
      embeds: [embed],
      components: [downloadRow(dl)],
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
      // Fallback: still show fetch without channel
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

    // Only Owner/Admin (or Discord Administrator) may assign Admin/Staff
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
        content: `Role **${roleName}** not found — run \`/setup\` first.`,
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
    if (!isStaffPlus(interaction.member)) {
      return interaction.reply({
        content: "Staff+ only.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!config.adminSecret) {
      return interaction.reply({
        content: "`ADMIN_SECRET` is not set in the bot environment.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
        return interaction.editReply({
          content: `API error (${result.status}): \`${JSON.stringify(result.body)}\``,
        });
      }
      const keys = result.body.keys || [];
      const list = keys.map((k) => `\`${k}\``).join("\n") || "(none)";
      // Also try to log to #key-logs without exposing in public
      try {
        const { findChannel } = require("./setup");
        const logCh = findChannel(interaction.guild, "key-logs");
        if (logCh?.isTextBased()) {
          await logCh.send({
            embeds: [
              {
                title: "Keys created",
                color: 0xe6852e,
                description: `By <@${interaction.user.id}> · plan \`${plan}\` · count ${keys.length}`,
                fields: [{ name: "Keys", value: list.slice(0, 1000) }],
                timestamp: new Date().toISOString(),
              },
            ],
          });
        }
      } catch {
        /* ignore log failures */
      }
      return interaction.editReply({
        content:
          `Created **${keys.length}** key(s) · plan \`${plan}\`${days ? ` · ${days}d` : ""}\n${list}\n\n` +
          "DM buyers the key, or have them run `/redeem key:…` in the server.",
      });
    } catch (err) {
      return interaction.editReply({ content: `Failed: \`${err.message}\`` });
    }
  }
}

module.exports = { commandData, handleCommand, isStaffPlus };
