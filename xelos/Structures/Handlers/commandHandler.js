// XelosV14 command handler: load Commands into client.commands and register globally.
const { loadFiles } = require('../../Functions/fileLoader');
const logger = require('./logger');

async function loadCommands(client) {
  const commands = new Map();
  const globalCommands = [];
  const files = await loadFiles('Commands');
  for (const file of files) {
    const command = require(file);
    if (!command.data || typeof command.execute !== 'function') throw new Error(`Geçersiz komut: ${file}`);
    const data = command.data.toJSON();
    if (commands.has(data.name)) throw new Error(`Tekrarlanan komut: ${data.name}`);
    commands.set(data.name, command);
    globalCommands.push(data);
  }
  await client.application.commands.set(globalCommands);
  client.commands.clear();
  for (const [name, command] of commands) client.commands.set(name, command);
  logger.info(`${commands.size} komut yüklendi ve global olarak kaydedildi.`);
}

module.exports = { loadCommands };
