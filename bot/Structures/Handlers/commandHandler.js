// XelosV14 command handler: load Commands into client.commands and register globally.
const { loadFiles } = require('../../Functions/fileLoader');
const logger = require('./logger');

async function loadCommands(client) {
  const commands = new Map();
  const globalCommands = [];
  const files = await loadFiles('Commands');
  for (const file of files) {
    const command = require(file);
    if (!command.data || typeof command.execute !== 'function') throw new Error(`Invalid command: ${file}`);
    const data = command.data.toJSON();
    const { PermissionsBitField } = require('discord.js');
    if (data.default_member_permissions !== String(PermissionsBitField.Flags.ManageChannels) || command.permissions !== PermissionsBitField.Flags.ManageChannels) {
      throw new Error(`Missing required management permission declaration: ${data.name}`);
    }
    if (commands.has(data.name)) throw new Error(`Tekrarlanan komut: ${data.name}`);
    commands.set(data.name, command);
    globalCommands.push(data);
  }
  await client.application.commands.set(globalCommands);
  client.commands.clear();
  for (const [name, command] of commands) client.commands.set(name, command);
  logger.info(`${commands.size} commands loaded and registered globally.`);
}

module.exports = { loadCommands };
