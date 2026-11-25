import i18n from './i18n.cjs';
const { t, runWithLanguage } = i18n;
import { createRequire } from 'node:module';
import { Collection, Events, MessageFlags } from 'discord.js';
import { handleSetup } from './setup.js';
import { handlePanel } from './panel.js';

const require = createRequire(import.meta.url);
const { loadCommands } = require('../bot/Structures/Handlers/commandHandler.js');
const ticketHandler = require('../bot/Events/Client/TicketSystem.js');
const initializeChecker = require('../bot/Structures/Tasks/ticketInactivityChecker.js');
const setupIds = new Set(['yontem_kategori', 'kategori_modal', 'role_category_setup']);
const { isManager, rateLimit } = require('../bot/Structures/Handlers/security');

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
    let interactionLocale = 'en';
    try {
      interactionLocale = interaction.locale || 'en';
      return await runWithLanguage(interactionLocale, async () => {
      if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else await interaction.reply({ content: t('Commands are still loading. Please try again shortly.'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (command.permissions && !(await isManager(interaction))) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else await interaction.reply({ content: t('You need the Manage Channels permission to use this command.'), flags: MessageFlags.Ephemeral });
          return;
        }
        if (!interaction.isAutocomplete() && !rateLimit(`command:${interaction.guildId}:${interaction.user.id}`, 5, 10000)) {
          await interaction.reply({ content: t('You are using commands too quickly. Please wait.'), flags: MessageFlags.Ephemeral }); return;
        }
        if (interaction.isAutocomplete()) {
          if (command.autocomplete) await command.autocomplete(interaction);
          else await interaction.respond([]);
        } else await command.execute(interaction, client);
        return;
      }
      if (await handleSetup(interaction)) return;
      if (await handlePanel(interaction)) return;
      if (setupIds.has(interaction.customId)) {
        if (!(await isManager(interaction))) {
          await interaction.reply({ content: t('You need the Manage Channels permission for this action.'), flags: MessageFlags.Ephemeral });
          return;
        }
        await interaction.reply({ content: t('This setup has expired, belongs to another user, or you lack permission.'), flags: MessageFlags.Ephemeral });
        return;
      }
      await ticketHandler.execute(interaction);
      });
    } catch (error) {
      console.error('Ticket operation failed:', error.name);
      if (interaction.isAutocomplete()) {
        if (!interaction.responded) await interaction.respond([]).catch(() => {});
      } else if (interaction.isRepliable()) {
        const response = { content: t('Unable to complete the action. Check the bot permissions and settings.', {}, interactionLocale), flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
        else await interaction.reply(response).catch(() => {});
      }
    }
  });
}
