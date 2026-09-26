"use strict";

const {
  ChannelType,
  PermissionFlagsBits,
  Colors,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

/** @typedef {{ name: string, color: number, hoist: boolean, mentionable?: boolean }} RoleSpec */

const ROLE_SPECS = /** @type {RoleSpec[]} */ ([
  { name: "Owner", color: Colors.DarkRed, hoist: true },
  { name: "Admin", color: 0xc0392b, hoist: true },
  { name: "Staff", color: 0xe6852e, hoist: true },
  { name: "Reseller", color: 0xd4a574, hoist: true },
  { name: "Customer", color: 0x5dade2, hoist: true },
  /** Verified public access — unlocked via #verify button */
  { name: "Citizen", color: 0x95a5a6, hoist: false },
]);

const STAFF_PLUS = ["Owner", "Admin", "Staff"];
const CUSTOMER_PLUS = ["Owner", "Admin", "Staff", "Customer"];
const RESELLER_PLUS = ["Owner", "Admin", "Staff", "Reseller"];
const CITIZEN_PLUS = ["Owner", "Admin", "Staff", "Citizen", "Customer", "Reseller"];

/** Canonical channel names (without emoji). findChannel matches these. */
const CHANNELS = {
  verify: "verify",
  honeypot: "do-not-type",
  announcements: "announcements",
  rules: "rules",
  status: "status",
  roblox: "roblox-versions",
  general: "general",
  feedback: "feedback",
  help: "help",
  customerChat: "customer-chat",
  staffChat: "staff-chat",
  keyLogs: "key-logs",
  reseller: "reseller",
};

const VERIFY_BUTTON_ID = "oxide-verify";
const HONEYPOT_NAMES = new Set(["do-not-type", "bot-trap", "🚫do-not-type", "🚫-do-not-type"]);

/**
 * Strip Discord channel name noise for matching.
 * @param {string} name
 */
function normalizeChannelName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[・·•|_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 */
function findRole(guild, name) {
  const lower = name.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) || null;
}

/**
 * Find text/category channel by logical name (ignores emoji prefixes).
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 * @param {import('discord.js').ChannelType} [type]
 */
function findChannel(guild, name, type) {
  const target = normalizeChannelName(name);
  return (
    guild.channels.cache.find((c) => {
      if (type !== undefined && c.type !== type) return false;
      const n = normalizeChannelName(c.name);
      return n === target || n.endsWith(`-${target}`) || n === target.replace(/-/g, "");
    }) || null
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
    reason: "OXIDE /setup-server",
  });
  return { role, created: true };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name
 * @param {object} options
 * @param {string[]} [options.aliases] legacy names to adopt/rename
 */
async function ensureCategory(guild, name, options = {}) {
  const aliases = (options.aliases || []).map((a) => normalizeChannelName(a));
  let cat = findChannel(guild, name, ChannelType.GuildCategory);
  if (!cat) {
    cat =
      guild.channels.cache.find((c) => {
        if (c.type !== ChannelType.GuildCategory) return false;
        if (c.name === name) return true;
        const n = normalizeChannelName(c.name);
        if (n === normalizeChannelName(name)) return true;
        // "info" matches "━━ info ━━" or plain "INFO"
        return aliases.some(
          (a) => n === a || n.includes(a) || a.includes(n)
        );
      }) || null;
  }
  if (cat) {
    const patch = {};
    if (cat.name !== name) patch.name = name;
    if (Object.keys(patch).length) await cat.edit(patch);
    if (options.permissionOverwrites) {
      await cat.permissionOverwrites.set(options.permissionOverwrites);
    }
    return { channel: cat, created: false };
  }
  cat = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: options.permissionOverwrites || [],
    reason: "OXIDE /setup-server",
  });
  return { channel: cat, created: true };
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} name display name (may include emoji)
 * @param {string} logicalName for find/idempotency
 * @param {import('discord.js').CategoryChannel} parent
 * @param {object} options
 */
async function ensureText(guild, name, logicalName, parent, options = {}) {
  let ch = findChannel(guild, logicalName, ChannelType.GuildText);
  if (ch) {
    const patch = {};
    if (parent && ch.parentId !== parent.id) patch.parent = parent.id;
    if (name && ch.name !== name) patch.name = name;
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
    reason: "OXIDE /setup-server",
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
 * Public after verify: @everyone denied; Citizen+ can view.
 * @param {import('discord.js').Guild} guild
 * @param {{ readOnly?: boolean }} [opts]
 */
function citizenChannelOverwrites(guild, opts = {}) {
  const everyone = guild.roles.everyone;
  /** @type {import('discord.js').OverwriteData[]} */
  const overwrites = [
    {
      id: everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  const citizen = findRole(guild, "Citizen");
  if (citizen) {
    overwrites.push({
      id: citizen.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        ...(opts.readOnly
          ? []
          : [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AddReactions,
            ]),
      ],
      deny: opts.readOnly
        ? [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
        : [],
    });
  }

  // Customer / Reseller inherit community visibility
  for (const name of ["Customer", "Reseller"]) {
    const role = findRole(guild, name);
    if (!role) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        ...(opts.readOnly
          ? []
          : [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ]),
      ],
      deny: opts.readOnly ? [PermissionFlagsBits.SendMessages] : [],
    });
  }

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
 * Verify category: only @everyone (unverified) + staff. Citizens may still see it
 * so they can re-read rules, but typically hidden from Citizen for a clean sidebar.
 * @param {import('discord.js').Guild} guild
 */
function verifyCategoryOverwrites(guild) {
  const everyone = guild.roles.everyone;
  /** @type {import('discord.js').OverwriteData[]} */
  const overwrites = [
    {
      id: everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];
  const citizen = findRole(guild, "Citizen");
  if (citizen) {
    // Hide verify gate after verification (cleaner UX)
    overwrites.push({
      id: citizen.id,
      deny: [PermissionFlagsBits.ViewChannel],
    });
  }
  for (const name of STAFF_PLUS) {
    const role = findRole(guild, name);
    if (!role) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

/**
 * Verify channel: everyone can see + use button (no typing needed).
 * @param {import('discord.js').Guild} guild
 */
function verifyChannelOverwrites(guild) {
  const everyone = guild.roles.everyone;
  /** @type {import('discord.js').OverwriteData[]} */
  const overwrites = [
    {
      id: everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
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
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

/**
 * Honeypot: everyone can view + send (so bots type); staff can manage.
 * @param {import('discord.js').Guild} guild
 */
function honeypotOverwrites(guild) {
  const everyone = guild.roles.everyone;
  /** @type {import('discord.js').OverwriteData[]} */
  const overwrites = [
    {
      id: everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];
  // Citizens also see honeypot if they somehow still have verify access —
  // primarily unverified see it. Also allow viewing from citizen community
  // by not denying. Staff exempt from kick at runtime.
  for (const name of STAFF_PLUS) {
    const role = findRole(guild, name);
    if (!role) continue;
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }
  return overwrites;
}

function isHoneypotChannel(channel) {
  if (!channel?.name) return false;
  const n = normalizeChannelName(channel.name);
  return HONEYPOT_NAMES.has(n) || n.includes("do-not-type") || n.includes("bot-trap");
}

/**
 * Idempotent OXIDE professional server layout + verify gate + honeypot.
 * @param {import('discord.js').Guild} guild
 * @param {{ siteUrl?: string, discordInvite?: string }} [meta]
 */
async function setupGuild(guild, meta = {}) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const summary = {
    rolesCreated: [],
    rolesExisting: [],
    channelsCreated: [],
    channelsExisting: [],
    notes: [],
  };

  for (const spec of ROLE_SPECS) {
    const { role, created } = await ensureRole(guild, spec);
    (created ? summary.rolesCreated : summary.rolesExisting).push(role.name);
  }

  // Migrate legacy Member → Citizen if Member exists and Citizen was just created
  const memberLegacy = findRole(guild, "Member");
  const citizenRole = findRole(guild, "Citizen");
  if (memberLegacy && citizenRole) {
    summary.notes.push(
      "Legacy **Member** role still exists — new joins verify into **Citizen**. You can delete Member when ready."
    );
  }

  await guild.roles.fetch();

  // ── VERIFY (unverified only) ──
  const verifyOw = verifyCategoryOverwrites(guild);
  const { channel: verifyCat, created: verifyCatNew } = await ensureCategory(
    guild,
    "━━ VERIFY ━━",
    { permissionOverwrites: verifyOw, aliases: ["verify", "verification"] }
  );
  (verifyCatNew ? summary.channelsCreated : summary.channelsExisting).push("━━ VERIFY ━━");

  {
    const { channel, created } = await ensureText(
      guild,
      "✅・verify",
      CHANNELS.verify,
      verifyCat,
      {
        topic: "Click the button to unlock the server",
        permissionOverwrites: verifyChannelOverwrites(guild),
      }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  {
    const { channel, created } = await ensureText(
      guild,
      "🚫・do-not-type",
      CHANNELS.honeypot,
      verifyCat,
      {
        topic: "ANTI-SPAM TRAP — typing here = kick",
        permissionOverwrites: honeypotOverwrites(guild),
      }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // ── INFO (Citizen+, read-only) ──
  const infoOw = citizenChannelOverwrites(guild, { readOnly: true });
  const { channel: infoCat, created: infoCatNew } = await ensureCategory(
    guild,
    "━━ INFO ━━",
    { permissionOverwrites: infoOw, aliases: ["info", "information"] }
  );
  (infoCatNew ? summary.channelsCreated : summary.channelsExisting).push("━━ INFO ━━");

  for (const [display, logical, topic] of [
    ["📢・announcements", CHANNELS.announcements, "Official OXIDE announcements"],
    ["📜・rules", CHANNELS.rules, "Server rules"],
    ["🟢・status", CHANNELS.status, "Live API / bot status"],
    ["🎮・roblox-versions", CHANNELS.roblox, "Latest Roblox Windows client version"],
  ]) {
    const { channel, created } = await ensureText(guild, display, logical, infoCat, {
      topic,
      permissionOverwrites: infoOw,
    });
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // ── COMMUNITY ──
  const communityOw = citizenChannelOverwrites(guild, { readOnly: false });
  const { channel: communityCat, created: communityCatNew } = await ensureCategory(
    guild,
    "━━ COMMUNITY ━━",
    {
      permissionOverwrites: communityOw,
      aliases: ["community", "text channels", "text-channels"],
    }
  );
  (communityCatNew ? summary.channelsCreated : summary.channelsExisting).push(
    "━━ COMMUNITY ━━"
  );

  for (const [display, logical, topic] of [
    ["💬・general", CHANNELS.general, "Community chat"],
    ["💡・feedback", CHANNELS.feedback, "Ideas and feedback"],
  ]) {
    const { channel, created } = await ensureText(
      guild,
      display,
      logical,
      communityCat,
      { topic, permissionOverwrites: communityOw }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // ── SUPPORT ──
  const { channel: supportCat, created: supportCatNew } = await ensureCategory(
    guild,
    "━━ SUPPORT ━━",
    { permissionOverwrites: communityOw, aliases: ["support"] }
  );
  (supportCatNew ? summary.channelsCreated : summary.channelsExisting).push("━━ SUPPORT ━━");
  {
    const { channel, created } = await ensureText(
      guild,
      "🆘・help",
      CHANNELS.help,
      supportCat,
      {
        topic: "Ask for help · staff will respond",
        permissionOverwrites: communityOw,
      }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // ── CUSTOMERS ──
  const custOw = privateOverwrites(guild, CUSTOMER_PLUS);
  const { channel: custCat, created: custCatNew } = await ensureCategory(
    guild,
    "━━ CUSTOMERS ━━",
    { permissionOverwrites: custOw, aliases: ["customers"] }
  );
  (custCatNew ? summary.channelsCreated : summary.channelsExisting).push("━━ CUSTOMERS ━━");
  {
    const { channel, created } = await ensureText(
      guild,
      "🔒・customer-chat",
      CHANNELS.customerChat,
      custCat,
      { topic: "Customer lounge", permissionOverwrites: custOw }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // ── STAFF ──
  const staffOw = privateOverwrites(guild, STAFF_PLUS);
  const { channel: staffCat, created: staffCatNew } = await ensureCategory(
    guild,
    "━━ STAFF ━━",
    { permissionOverwrites: staffOw, aliases: ["staff"] }
  );
  (staffCatNew ? summary.channelsCreated : summary.channelsExisting).push("━━ STAFF ━━");
  for (const [display, logical, topic] of [
    ["🔒・staff-chat", CHANNELS.staffChat, "Internal staff chat"],
    ["🔒・key-logs", CHANNELS.keyLogs, "License / key / mod audit log"],
  ]) {
    const { channel, created } = await ensureText(
      guild,
      display,
      logical,
      staffCat,
      { topic, permissionOverwrites: staffOw }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // ── RESELLERS ──
  const resOw = privateOverwrites(guild, RESELLER_PLUS);
  const { channel: resCat, created: resCatNew } = await ensureCategory(
    guild,
    "━━ RESELLERS ━━",
    { permissionOverwrites: resOw, aliases: ["resellers"] }
  );
  (resCatNew ? summary.channelsCreated : summary.channelsExisting).push("━━ RESELLERS ━━");
  {
    const { channel, created } = await ensureText(
      guild,
      "🔒・reseller",
      CHANNELS.reseller,
      resCat,
      { topic: "Reseller channel", permissionOverwrites: resOw }
    );
    (created ? summary.channelsCreated : summary.channelsExisting).push(channel.name);
  }

  // Seed verify panel
  const verifyCh = findChannel(guild, CHANNELS.verify, ChannelType.GuildText);
  if (verifyCh?.isTextBased()) {
    const messages = await verifyCh.messages.fetch({ limit: 15 }).catch(() => null);
    const hasPanel =
      messages &&
      [...messages.values()].some(
        (m) =>
          m.author?.bot &&
          m.components?.some((row) =>
            row.components?.some((c) => c.customId === VERIFY_BUTTON_ID)
          )
      );
    if (!hasPanel) {
      const site = meta.siteUrl || "https://oxide-gate-site.vercel.app";
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(VERIFY_BUTTON_ID)
          .setLabel("Verify — unlock OXIDE")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅")
      );
      await verifyCh.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Welcome to OXIDE")
            .setColor(0xe6852e)
            .setDescription(
              [
                "This server is **locked** until you verify.",
                "",
                "Click **Verify — unlock OXIDE** below to get the **Citizen** role and access announcements, chat, and support.",
                "",
                `Site: ${site}`,
                "Do **not** type in 🚫・do-not-type — that channel is an anti-spam trap.",
              ].join("\n")
            )
            .setFooter({ text: "OXIDE verification" }),
        ],
        components: [row],
      });
      summary.notes.push("Posted verify button panel in #verify");
    }
  }

  // Seed honeypot warning
  const honeyCh = findChannel(guild, CHANNELS.honeypot, ChannelType.GuildText);
  if (honeyCh?.isTextBased()) {
    const messages = await honeyCh.messages.fetch({ limit: 10 }).catch(() => null);
    const hasWarn =
      messages &&
      [...messages.values()].some(
        (m) =>
          m.author?.bot &&
          /do not type|anti-spam|kicked/i.test(m.embeds?.[0]?.title || m.content || "")
      );
    if (!hasWarn) {
      await honeyCh.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("⚠️ DO NOT TYPE HERE")
            .setColor(0xe74c3c)
            .setDescription(
              [
                "**This is an anti-spam honeypot.**",
                "",
                "If you send **any** message in this channel, you will be **kicked** from the server.",
                "",
                "Staff and bots are exempt. Everyone else: leave this channel alone.",
                "",
                "Go to ✅・verify and click the button instead.",
              ].join("\n")
            )
            .setFooter({ text: "OXIDE anti-spam" }),
        ],
      });
      summary.notes.push("Posted honeypot warning in #do-not-type");
    }
  }

  // Seed help
  const helpCh = findChannel(guild, CHANNELS.help, ChannelType.GuildText);
  if (helpCh?.isTextBased()) {
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
              "Commands: `/help` · `/status` · `/products` · `/download`",
          },
        ],
      });
    }
  }

  // Seed rules if empty
  const rulesCh = findChannel(guild, CHANNELS.rules, ChannelType.GuildText);
  if (rulesCh?.isTextBased()) {
    const messages = await rulesCh.messages.fetch({ limit: 5 }).catch(() => null);
    if (messages && messages.size === 0) {
      await rulesCh.send({
        embeds: [
          {
            title: "OXIDE Rules",
            color: 0xe6852e,
            description:
              "1. Be respectful — no harassment or hate.\n" +
              "2. No sharing keys, cracks, or piracy.\n" +
              "3. No spam or self-promo without Staff OK.\n" +
              "4. Keep support questions in 🆘・help.\n" +
              "5. Never type in 🚫・do-not-type.\n" +
              "6. Staff decisions are final.",
          },
        ],
      });
    }
  }

  // Migrate existing trusted members → Citizen so they aren't locked out after gate
  if (citizenRole) {
    try {
      await guild.members.fetch();
      let migrated = 0;
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        if (member.roles.cache.has(citizenRole.id)) continue;
        const trusted = ["Member", "Customer", "Reseller", "Staff", "Admin", "Owner"].some(
          (n) => {
            const r = findRole(guild, n);
            return r && member.roles.cache.has(r.id);
          }
        );
        if (!trusted) continue;
        try {
          await member.roles.add(citizenRole, "OXIDE setup migrate → Citizen");
          migrated += 1;
        } catch {
          /* hierarchy */
        }
      }
      if (migrated > 0) {
        summary.notes.push(`Granted Citizen to ${migrated} existing member(s)`);
      }
    } catch (err) {
      summary.notes.push(`Citizen migrate skipped: ${err.message}`);
    }
  }

  return summary;
}

/**
 * True when core layout is missing (safe to auto-setup).
 * @param {import('discord.js').Guild} guild
 */
function needsSetup(guild) {
  const verify = findChannel(guild, CHANNELS.verify, ChannelType.GuildText);
  const citizen = findRole(guild, "Citizen");
  const roblox = findChannel(guild, CHANNELS.roblox, ChannelType.GuildText);
  return !verify || !citizen || !roblox;
}

module.exports = {
  setupGuild,
  needsSetup,
  findChannel,
  findRole,
  normalizeChannelName,
  isHoneypotChannel,
  ROLE_SPECS,
  STAFF_PLUS,
  CITIZEN_PLUS,
  CUSTOMER_PLUS,
  CHANNELS,
  VERIFY_BUTTON_ID,
};
