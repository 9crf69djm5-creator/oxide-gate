"use strict";

require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { config } = require("./config");
const { commandData } = require("./commands");
const { askCommandData } = require("./helpchat");

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  console.log(`Registering ${commandData.length} guild commands for ${config.guildId}…`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commandData,
  });
  // Global so /ask also shows up in DMs with the bot; guild list above must not repeat it.
  const global = config.aiHelpEnabled ? [askCommandData] : [];
  await rest.put(Routes.applicationCommands(config.clientId), { body: global });
  console.log(`Slash commands registered (${global.length} global).`);
}

if (require.main === module) {
  registerCommands()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { registerCommands };
