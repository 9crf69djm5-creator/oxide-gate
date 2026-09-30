"use strict";

/**
 * OXIDE AI in Discord. Answers only in the guild's help channel and in DMs
 * with the bot (plain messages or /ask). Everywhere else it stays silent.
 */
const {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");
const { config } = require("./config");
const { askOxide, MAX_CHARS } = require("./ai");
const { findChannel, CHANNELS, HELP_TOPIC } = require("./setup");
const { isStaffPlus } = require("./commands");
const { brandEmbed } = require("./brand");

/** #updates and #announcements: never answer there, even if misconfigured as help. */
const NEVER_ANSWER_IN = new Set(["1554915668569104464", "1553035461084323892"]);
const INTRO_TITLE = "OXIDE AI help";

const USER_COOLDOWN_MS = 8_000;
const USER_WINDOW_MS = 60_000;
const USER_WINDOW_MAX = 4;
const USER_HOUR_MAX = 30;
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_WINDOW_MAX = 30;
const MAX_CONCURRENT = 3;
const HISTORY_TTL_MS = 15 * 60_000;
const HISTORY_KEEP = 6;
const REPLY_LIMIT = 1900;

let helpChannelId = null;
const userHits = new Map();
const lastWarned = new Map();
const inflight = new Set();
let globalHits = [];
let active = 0;
const histories = new Map();

const askCommandData = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask the OXIDE AI a question (works in the help channel or in DMs with the bot)")
  .addStringOption((o) =>
    o.setName("question").setDescription("Your question").setRequired(true).setMaxLength(MAX_CHARS)
  )
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .toJSON();

function findHelpChannel(guild) {
  const byId = config.helpChannelId ? guild.channels.cache.get(config.helpChannelId) : null;
  const ch =
    (byId?.type === ChannelType.GuildText ? byId : null) ||
    findChannel(guild, CHANNELS.help, ChannelType.GuildText) ||
    findChannel(guild, "oxide-help", ChannelType.GuildText);
  if (!ch || NEVER_ANSWER_IN.has(ch.id)) return null;
  return ch;
}

/**
 * Find (or create once) the help channel, label it, and post a one-time intro.
 * @param {import('discord.js').Guild} guild
 */
async function ensureHelpChannel(guild) {
  await guild.channels.fetch();
  let ch = findHelpChannel(guild);
  let created = false;
  if (!ch) {
    const support = findChannel(guild, "support", ChannelType.GuildCategory);
    ch = await guild.channels.create({
      name: "🆘・help",
      type: ChannelType.GuildText,
      parent: support?.id,
      topic: HELP_TOPIC,
      reason: "OXIDE AI help channel",
    });
    if (support) await ch.lockPermissions().catch(() => {});
    created = true;
  } else if (ch.topic !== HELP_TOPIC) {
    await ch.setTopic(HELP_TOPIC, "OXIDE AI help").catch((err) =>
      console.warn("[ai] could not set #help topic:", err.message)
    );
  }
  helpChannelId = ch.id;

  const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
  const hasIntro =
    recent &&
    [...recent.values()].some(
      (m) => m.author?.id === guild.client.user.id && m.embeds?.[0]?.title === INTRO_TITLE
    );
  if (!hasIntro) {
    await ch
      .send({
        embeds: [
          brandEmbed({
            title: INTRO_TITLE,
            description: [
              "Type your question here and the **OXIDE AI** answers — keys, download, setup, plans, status.",
              "Prefer private? **DM the bot** or use `/ask` in DMs.",
              "",
              "It can't reset HWIDs or recover keys for you — staff handle that here.",
              `Discord invite: ${config.discordInvite}`,
            ].join("\n"),
          }),
        ],
        allowedMentions: { parse: [] },
      })
      .catch((err) => console.warn("[ai] intro post failed:", err.message));
  }
  return { channel: ch, created };
}

function prune(list, windowMs, now) {
  return list.filter((t) => now - t < windowMs);
}

/** @returns {{ ok: true } | { ok: false, retryMs: number, why: string }} */
function takeSlot(userId) {
  const now = Date.now();
  if (inflight.has(userId)) return { ok: false, retryMs: 5_000, why: "busy" };
  const mine = prune(userHits.get(userId) || [], 60 * 60_000, now);
  const lastMin = mine.filter((t) => now - t < USER_WINDOW_MS);
  const last = mine[mine.length - 1] || 0;
  if (now - last < USER_COOLDOWN_MS) return { ok: false, retryMs: USER_COOLDOWN_MS - (now - last), why: "user" };
  if (lastMin.length >= USER_WINDOW_MAX)
    return { ok: false, retryMs: USER_WINDOW_MS - (now - lastMin[0]), why: "user" };
  if (mine.length >= USER_HOUR_MAX) return { ok: false, retryMs: 60 * 60_000 - (now - mine[0]), why: "user" };
  globalHits = prune(globalHits, GLOBAL_WINDOW_MS, now);
  if (globalHits.length >= GLOBAL_WINDOW_MAX || active >= MAX_CONCURRENT)
    return { ok: false, retryMs: 15_000, why: "global" };
  mine.push(now);
  userHits.set(userId, mine);
  globalHits.push(now);
  inflight.add(userId);
  active += 1;
  if (userHits.size > 5000) userHits.clear();
  return { ok: true };
}

function releaseSlot(userId) {
  inflight.delete(userId);
  active = Math.max(0, active - 1);
}

function limitText(limit) {
  const secs = Math.max(1, Math.ceil(limit.retryMs / 1000));
  return limit.why === "global"
    ? `The OXIDE AI is busy right now — try again in ~${secs}s.`
    : `Slow down a little — you can ask again in ~${secs}s.`;
}

function historyFor(key) {
  const h = histories.get(key);
  if (!h || Date.now() - h.at > HISTORY_TTL_MS) return [];
  return h.msgs;
}

function remember(key, question, answer) {
  const msgs = [...historyFor(key), { role: "user", content: question }, { role: "assistant", content: answer }];
  histories.set(key, { at: Date.now(), msgs: msgs.slice(-HISTORY_KEEP) });
  if (histories.size > 2000) histories.clear();
}

function clip(text) {
  const t = String(text || "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .trim();
  return t.length > REPLY_LIMIT ? `${t.slice(0, REPLY_LIMIT - 1)}…` : t;
}

function downText(isDm) {
  return isDm
    ? `The OXIDE AI is down right now. Ask a human in the OXIDE Discord: ${config.discordInvite}`
    : `The OXIDE AI is down right now. Staff can still help here, or join: ${config.discordInvite}`;
}

async function answer(historyKey, question, prior) {
  const convo = [...historyFor(historyKey)];
  if (prior && !convo.some((m) => m.content === prior)) convo.push({ role: "assistant", content: prior });
  convo.push({ role: "user", content: question.slice(0, MAX_CHARS) });
  const result = await askOxide(convo);
  if (!result.ok) return null;
  const reply = clip(result.reply);
  remember(historyKey, question, reply);
  console.log(`[ai] answered via ${result.provider} (${reply.length} chars)`);
  return reply;
}

/**
 * Plain messages: every human question in #help, and any DM to the bot.
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').Client} client
 */
async function handleHelpMessage(message, client) {
  if (!message.author || message.author.bot || message.webhookId || message.system) return;
  const botId = client.user?.id;
  if (!botId || message.author.id === botId) return;

  const isDm = !message.guildId;
  if (!isDm) {
    if (message.guildId !== config.guildId) return;
    if (!helpChannelId || message.channelId !== helpChannelId) return;
    if (NEVER_ANSWER_IN.has(message.channelId)) return;
  }

  const text = String(message.content || "")
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .trim();
  if (!text) return;

  let prior = null;
  if (!isDm) {
    const mentionedBot = message.mentions.users.has(botId);
    let repliedToBot = false;
    let repliedToHuman = false;
    if (message.reference?.messageId) {
      const ref = await message.fetchReference().catch(() => null);
      if (ref?.author?.id === botId) {
        repliedToBot = true;
        prior = ref.content || null;
      } else if (ref && !ref.author?.bot) {
        repliedToHuman = true;
      }
    }
    const addressed = mentionedBot || repliedToBot;
    const mentionsHuman = message.mentions.users.some((u) => !u.bot && u.id !== message.author.id);
    // Members talking to each other, or staff answering someone, are left alone.
    if (!addressed && (repliedToHuman || mentionsHuman)) return;
    if (!addressed && isStaffPlus(message.member)) return;
  }

  const limit = takeSlot(message.author.id);
  if (!limit.ok) {
    const now = Date.now();
    if (now - (lastWarned.get(message.author.id) || 0) < 30_000) return;
    lastWarned.set(message.author.id, now);
    const warn = await message
      .reply({ content: limitText(limit), allowedMentions: { parse: [], repliedUser: false } })
      .catch(() => null);
    if (warn && !isDm) setTimeout(() => warn.delete().catch(() => {}), 15_000);
    return;
  }

  const typing = setInterval(() => message.channel.sendTyping().catch(() => {}), 8_000);
  try {
    await message.channel.sendTyping().catch(() => {});
    const key = isDm ? `dm:${message.author.id}` : `${message.channelId}:${message.author.id}`;
    const reply = await answer(key, text, prior);
    await message.reply({
      content: reply || downText(isDm),
      allowedMentions: { parse: [], repliedUser: false },
      flags: MessageFlags.SuppressEmbeds,
    });
  } catch (err) {
    console.warn("[ai] message reply failed:", err.message);
  } finally {
    clearInterval(typing);
    releaseSlot(message.author.id);
  }
}

/**
 * /ask — answers publicly in #help or in DMs; anywhere else it only points the
 * user to those places (ephemeral, no AI answer).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleAsk(interaction) {
  const isDm = !interaction.guildId;
  if (!isDm) {
    const inHelp =
      interaction.guildId === config.guildId &&
      helpChannelId &&
      interaction.channelId === helpChannelId &&
      !NEVER_ANSWER_IN.has(interaction.channelId);
    if (!inHelp) {
      return interaction.reply({
        content: helpChannelId
          ? `I only answer in <#${helpChannelId}> or in DMs with me.`
          : "I only answer in the help channel or in DMs with me.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const question = String(interaction.options.getString("question", true) || "").trim();
  if (!question) {
    return interaction.reply({ content: "Ask a question.", flags: MessageFlags.Ephemeral });
  }

  const limit = takeSlot(interaction.user.id);
  if (!limit.ok) {
    return interaction.reply({ content: limitText(limit), flags: MessageFlags.Ephemeral });
  }
  try {
    await interaction.deferReply();
    const key = isDm ? `dm:${interaction.user.id}` : `${interaction.channelId}:${interaction.user.id}`;
    const reply = await answer(key, question, null);
    const quoted = clip(question).slice(0, 300).replace(/\n/g, " ");
    await interaction.editReply({
      content: clip(`> ${quoted}\n${reply || downText(isDm)}`),
      allowedMentions: { parse: [] },
      flags: MessageFlags.SuppressEmbeds,
    });
  } finally {
    releaseSlot(interaction.user.id);
  }
}

function helpChannel() {
  return helpChannelId;
}

module.exports = {
  askCommandData,
  ensureHelpChannel,
  handleHelpMessage,
  handleAsk,
  helpChannel,
};
