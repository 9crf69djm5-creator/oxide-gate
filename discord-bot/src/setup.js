"use strict";

const {
  ChannelType,
  PermissionFlagsBits,
  Colors,
} = require("discord.js");

/** @typedef {{ name: string, color: number, hoist: boolean, mentionable?: boolean }} RoleSpec */

const ROLE_SPECS = /** @type {RoleSpec[]} */ ([
  { name: "Owner", color: Colors.DarkRed, hoist: true },
  { name: "Admin", color: 0xc0392b, hoist: true },
  { name: "Staff", color: 0xe6852e, hoist: true },
  { name: "Reseller", color: 0xd4a574, hoist: true },
  { name: "Customer", color: 0x5dade2, hoist: true },
  { name: "Member", color: 0x95a5a6, hoist: false },
]);

const STAFF_PLUS = ["Owner", "Admin", "Staff"];
const CUSTOMER_PLUS = ["Owner", "Admin", "Staff", "Customer"];
const RESELLER_PLUS = ["Owner", "Admin", "Staff", "Reseller"];

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 */
function findRole(guild, name) {
  const lower = name.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) || null;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 * @param {import('discord.js').ChannelType} [type]
 */
function findChannel(guild, name, type) {
  const lower = name.toLowerCase();
  return (
    guild.channels.cache.find(
      (c) =>
        c.name.toLowerCase() === lower &&
        (type === undefined || c.type === type)
    ) || null
  );
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {RoleSpec} spec
 */
async function ensureRole(guild, spec) {
  let role = findRole(guild, spec.name);
  if (role) return { role, created: false };
  role = await guild.roles.create({
    name: spec.name,
    color: spec.color,
    hoist: spec.hoist,
    mentionable: Boolean(spec.mentionable),
    reason: "OXIDE /setup",
  });
  return { role, created: true };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 * @param {object} options
 */
async function ensureCategory(guild, name, options = {}) {
  let cat = findChannel(guild, name, ChannelType.GuildCategory);
  if (cat) {
    if (options.permissionOverwrites) {
      await cat.permissionOverwrites.set(options.permissionOverwrites);
    }
    return { channel: cat, created: false };
  }
  cat = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: options.permissionOverwrites || [],
    reason: "OXIDE /setup",
  });
  return { channel: cat, created: true };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 * @param {import('discord.js').CategoryChannel} parent
 * @param {object} options
 */
async function ensureText(guild, name, parent, options = {}) {
  let ch = findChannel(guild, name, ChannelType.GuildText);
  if (ch) {
    const patch = {};
    if (parent && ch.parentId !== parent.id) patch.parent = parent.id;
    if (options.topic && ch.topic !== options.topic) patch.topic = options.topic;
    if (Object.keys(patch).length) await ch.edit(patch);
    if (options.permissionOverwrites) {
      await ch.permissionOverwrites.set(options.permissionOverwrites);
    }
    return { channel: ch, created: false };
  }
  ch = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic: options.topic || undefined,
    permissionOverwrites: options.permissionOverwrites || [],
    reason: "OXIDE /setup",
  });
  return { channel: ch, created: true };
}

/**
 * Private category: @everyone cannot view; listed role names can.
 * @param {import('discord.js').Guild} guild
 * @param {string[]} roleNames
 */
function privateOverwrites(guild, roleNames) {
  const everyone = guild.roles.everyone;
  /** @type {import('discord.js').OverwriteData[]} */
  const overwrites = [
    {
      id: everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];
  for (const name of roleNames) {
    const role = findRole(guild, name);
    if (!role) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }
  return overwrites;
}

/**
 * Read-only for @everyone / Member; staff can post.
 * @param {import('discord.js').Guild} guild
 */
function infoChannelOverwrites(guild) {
  const everyone = guild.roles.everyone;
  /** @type {import('discord.js').OverwriteData[]} */
  const overwrites = [
    {
      id: everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
    },
  ];
  for (const name of STAFF_PLUS) {
    const role = findRole(guild, name);
    if (!role) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

/**
 * Support: members can view + send (or read help).
 * @param {import('discord.js').Guild} guild
 */
function supportOverwrites(guild) {
  const everyone = guild.roles.everyone;
  return [
    {
      id: everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];
}

/**
 * Idempotent OXIDE server layout.
 * @param {import('discord.js').Guild} guild
 */
async function setupGuild(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const summary = {
    rolesCreated: [],
    rolesExisting: [],
    channelsCreated: [],
    channelsExisting: [],
  };

  for (const spec of ROLE_SPECS) {
    const { role, created } = await ensureRole(guild, spec);
    (created ? summary.rolesCreated : summary.rolesExisting).push(role.name);
  }

  // Re-fetch roles after create
  await guild.roles.fetch();

  // INFO — public read-only
  const infoOw = infoChannelOverwrites(guild);
  const { channel: infoCat, created: infoCatNew } = await ensureCategory(guild, "INFO", {
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ],
  });
  (infoCatNew ? summary.channelsCreated : summary.channelsExisting).push("INFO");

  for (const [name, topic] of [
    ["announcements", "Official OXIDE announcements"],
    ["rules", "Server rules"],
    ["status", "Service / gate status"],
    ["roblox-versions", "Latest Roblox Windows client version"],
  ]) {
    const { channel, created } = await ensureText(guild, name, infoCat, {
      topic,
      permissionOverwrites: infoOw,
    });
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // SUPPORT
  const { channel: supportCat, created: supportCatNew } = await ensureCategory(
    guild,
    "SUPPORT"
  );
  (supportCatNew ? summary.channelsCreated : summary.channelsExisting).push("SUPPORT");
  {
    const { channel, created } = await ensureText(guild, "help", supportCat, {
      topic: "Ask for help · open a ticket with staff",
      permissionOverwrites: supportOverwrites(guild),
    });
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // CUSTOMERS — private
  const custOw = privateOverwrites(guild, CUSTOMER_PLUS);
  const { channel: custCat, created: custCatNew } = await ensureCategory(
    guild,
    "CUSTOMERS",
    { permissionOverwrites: custOw }
  );
  (custCatNew ? summary.channelsCreated : summary.channelsExisting).push("CUSTOMERS");
  {
    const { channel, created } = await ensureText(guild, "customer-chat", custCat, {
      topic: "Customer lounge",
      permissionOverwrites: custOw,
    });
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // STAFF — private
  const staffOw = privateOverwrites(guild, STAFF_PLUS);
  const { channel: staffCat, created: staffCatNew } = await ensureCategory(
    guild,
    "STAFF",
    { permissionOverwrites: staffOw }
  );
  (staffCatNew ? summary.channelsCreated : summary.channelsExisting).push("STAFF");
  for (const [name, topic] of [
    ["staff-chat", "Internal staff chat"],
    ["key-logs", "License / key audit log"],
  ]) {
    const { channel, created } = await ensureText(guild, name, staffCat, {
      topic,
      permissionOverwrites: staffOw,
    });
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // RESELLERS — private
  const resOw = privateOverwrites(guild, RESELLER_PLUS);
  const { channel: resCat, created: resCatNew } = await ensureCategory(
    guild,
    "RESELLERS",
    { permissionOverwrites: resOw }
  );
  (resCatNew ? summary.channelsCreated : summary.channelsExisting).push("RESELLERS");
  {
    const { channel, created } = await ensureText(guild, "reseller", resCat, {
      topic: "Reseller channel",
      permissionOverwrites: resOw,
    });
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // Seed help message if empty
  const helpCh = findChannel(guild, "help", ChannelType.GuildText);
  if (helpCh) {
    const messages = await helpCh.messages.fetch({ limit: 5 }).catch(() => null);
    if (messages && messages.size === 0) {
      await helpCh.send({
        embeds: [
          {
            title: "OXIDE Support",
            color: 0xe6852e,
            description:
              "Need help with keys, download, or the client?\n\n" +
              "• Describe your issue clearly\n" +
              "• Include your plan (week / month / lifetime) if relevant\n" +
              "• Staff will respond here\n\n" +
              "Commands: `/help` · `/status` · `/roblox-version`",
          },
        ],
      });
    }
  }

  return summary;
}

/**
 * True when core INFO layout is missing (safe to auto-setup).
 * @param {import('discord.js').Guild} guild
 */
function needsSetup(guild) {
  const info = findChannel(guild, "INFO", ChannelType.GuildCategory);
  const roblox = findChannel(guild, "roblox-versions", ChannelType.GuildText);
  return !info || !roblox;
}

module.exports = {
  setupGuild,
  needsSetup,
  findChannel,
  findRole,
  ROLE_SPECS,
  STAFF_PLUS,
};
