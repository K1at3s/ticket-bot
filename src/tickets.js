import { createRequire } from 'node:module';
import { Collection, Events, MessageFlags } from 'discord.js';
import { handlePanel } from './panel.js';

const require = createRequire(import.meta.url);
const { loadCommands } = require('../xelos/Structures/Handlers/commandHandler.js');
const categoryHandler = require('../xelos/Events/Client/TicketCategory.js');
const ticketHandler = require('../xelos/Events/Client/TicketSystem.js');
const initializeChecker = require('../xelos/Structures/Tasks/ticketInactivityChecker.js');
const setupIds = new Set(['yontem_kategori', 'kategori_modal', 'role_category_setup']);
const { isManager, rateLimit } = require('../xelos/Structures/Handlers/security');

export function registerTickets(client) {
  client.config = { emojis: { x: '❌', check2: '✅' } };
  client.commands = new Collection();
  client.once(Events.ClientReady, async () => {
    try {
      await loadCommands(client);
      initializeChecker(client);
    } catch (error) {
      console.error('Global command registration failed:', error.name);
    }
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inGuild()) return;
    try {
      if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else await interaction.reply({ content: 'Commands are still loading. Please try again shortly.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (command.permissions && !(await isManager(interaction))) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else await interaction.reply({ content: 'You need the Manage Channels permission to use this command.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (!interaction.isAutocomplete() && !rateLimit(`command:${interaction.guildId}:${interaction.user.id}`, 5, 10000)) {
          await interaction.reply({ content: 'You are using commands too quickly. Please wait.', flags: MessageFlags.Ephemeral }); return;
        }
        if (interaction.isAutocomplete()) {
          if (command.autocomplete) await command.autocomplete(interaction);
          else await interaction.respond([]);
        } else await command.execute(interaction, client);
        return;
      }
      if (await handlePanel(interaction)) return;
      if (setupIds.has(interaction.customId)) {
        if (!(await isManager(interaction))) {
          await interaction.reply({ content: 'You need the Manage Channels permission for this action.', flags: MessageFlags.Ephemeral });
          return;
        }
        await categoryHandler.execute(interaction);
        return;
      }
      await ticketHandler.execute(interaction);
    } catch (error) {
      console.error('Ticket operation failed:', error.name);
      if (interaction.isAutocomplete()) {
        if (!interaction.responded) await interaction.respond([]).catch(() => {});
      } else if (interaction.isRepliable()) {
        const response = { content: 'Unable to complete the action. Check the bot permissions and settings.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
        else await interaction.reply(response).catch(() => {});
      }
    }
  });
}
