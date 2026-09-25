"use strict";

require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { config } = require("./config");
const { commandData } = require("./commands");

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.token);
  console.log(`Registering ${commandData.length} guild commands for ${config.guildId}…`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commandData,
  });
  console.log("Slash commands registered.");
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
