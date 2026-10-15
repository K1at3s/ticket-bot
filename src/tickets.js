import { createRequire } from 'node:module';
import { Collection, Events, MessageFlags, PermissionsBitField } from 'discord.js';
import { handlePanel } from './panel.js';

const require = createRequire(import.meta.url);
const { loadCommands } = require('../xelos/Structures/Handlers/commandHandler.js');
const categoryHandler = require('../xelos/Events/Client/TicketCategory.js');
const ticketHandler = require('../xelos/Events/Client/TicketSystem.js');
const initializeChecker = require('../xelos/Structures/Tasks/ticketInactivityChecker.js');
const Server = require('../xelos/Structures/Schemas/Server.js');
const setupIds = new Set(['yontem_kategori', 'kategori_modal', 'role_category_setup']);
const controlIds = new Set(['claim_ticket', 'close', 'del', 'open', 'transcript', 'close_ticket_modal']);
const creationLocks = new Set();

export function registerTickets(client) {
  client.config = { emojis: { x: '❌', check2: '✅' } };
  client.commands = new Collection();
  client.once(Events.ClientReady, async () => {
    try {
      await loadCommands(client);
      initializeChecker(client);
    } catch (error) {
      console.error('Global komut kaydı başarısız:', error.name);
    }
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inGuild()) return;
    const isCreation = interaction.isModalSubmit() && interaction.customId.startsWith('create_ticket_subject_modal');
    const key = `${interaction.guildId}:${interaction.user.id}`;
    let locked = false;
    try {
      if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else await interaction.reply({ content: 'Komutlar henüz yüklenmedi. Biraz sonra tekrar dene.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (command.permissions && !interaction.memberPermissions.has(command.permissions)) {
          if (interaction.isAutocomplete()) await interaction.respond([]);
          else await interaction.reply({ content: 'Bu komut için Kanalları Yönet yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (interaction.isAutocomplete()) {
          if (command.autocomplete) await command.autocomplete(interaction);
          else await interaction.respond([]);
        } else await command.execute(interaction, client);
        return;
      }
      if (await handlePanel(interaction)) return;
      if (setupIds.has(interaction.customId)) {
        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageChannels)) {
          await interaction.reply({ content: 'Bu işlem için Kanalları Yönet yetkisi gerekiyor.', flags: MessageFlags.Ephemeral });
          return;
        }
        await categoryHandler.execute(interaction);
        return;
      }
      if (controlIds.has(interaction.customId)) {
        const settings = await Server.findOne({ guildId: interaction.guildId });
        const ticket = settings?.destekUser.find(t => t.channelId === interaction.channelId);
        const staff = interaction.memberPermissions.has(PermissionsBitField.Flags.ManageChannels)
          || interaction.member.roles.cache.some(r => settings?.destekRole.includes(r.id));
        const ownerClosing = ['close', 'close_ticket_modal'].includes(interaction.customId) && ticket?.userId === interaction.user.id;
        if (!ticket || (!staff && !ownerClosing)) {
          await interaction.reply({ content: 'Bu talep işlemi için yetkiniz yok.', flags: MessageFlags.Ephemeral });
          return;
        }
        if (['close', 'close_ticket_modal', 'claim_ticket'].includes(interaction.customId) && ticket.closed) {
          await interaction.reply({ content: 'Bu talep zaten kapalı.', flags: MessageFlags.Ephemeral });
          return;
        }
      }
      if (isCreation) {
        if (creationLocks.has(key)) {
          await interaction.reply({ content: 'Talebiniz zaten oluşturuluyor.', flags: MessageFlags.Ephemeral });
          return;
        }
        creationLocks.add(key);
        locked = true;
      }
      await ticketHandler.execute(interaction);
    } catch (error) {
      console.error('Ticket işlemi başarısız:', error.name);
      if (interaction.isAutocomplete()) {
        if (!interaction.responded) await interaction.respond([]).catch(() => {});
      } else if (interaction.isRepliable()) {
        const response = { content: 'İşlem tamamlanamadı. Bot yetkilerini ve ayarları kontrol edin.', flags: MessageFlags.Ephemeral };
        if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
        else await interaction.reply(response).catch(() => {});
      }
    } finally {
      if (locked) creationLocks.delete(key);
    }
  });
}
