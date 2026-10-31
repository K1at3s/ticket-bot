const { t, runWithLanguage, localizeCommand } = require('../../../src/i18n.cjs');
const { ComponentType, EmbedBuilder, ButtonBuilder, ButtonStyle, Colors, PermissionsBitField, ChannelType, ActionRowBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const serverDB = require("../../Structures/Schemas/Server");
const S = require('../../Structures/Handlers/security');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketsystem")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)

    .setDescription("Manage the ticket system.")

    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")

        .setDescription("Starts the interactive setup for the ticket system.")

    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")

        .setDescription("Configure additional settings for the ticket system.")

        .addChannelOption((option) =>
          option
            .setName("log-channel")

            .setDescription("The channel to send ticket logs to.")

            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption((option) =>
          option
            .setName("autoclose-duration")

            .setDescription("Set inactivity duration (e.g., 24h, 3d) or 'disable'.")

            .setRequired(false)
        )
    )
    .addSubcommand(sub => sub.setName('edit')
      .setDescription('Edit the saved ticket panel, messages and embeds.')
      )
    .addSubcommandGroup((group) =>
      group
        .setName('auto-response')

        .setDescription('Manage automated responses for tickets.')

        .addSubcommand((sub) =>
          sub
            .setName('add')

            .setDescription('Add a new auto-response.')

            .addStringOption((opt) => opt.setName('keyword').setDescription('The keyword to trigger the response.').setRequired(true))
            .addStringOption((opt) => opt.setName('response').setDescription('The automated message to send.').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')

            .setDescription('Remove an auto-response.')

            .addStringOption((opt) => opt.setName('keyword').setDescription('The keyword of the response to remove.').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('list')

            .setDescription('List all auto-responses.')

        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('search')

        .setDescription("Searches for a user's past tickets.")

        .addUserOption(option =>
            option.setName('user')

                .setDescription('The user whose tickets you want to search.')

                .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Resets and disables the ticket system.")

    ),
  cooldown: 5000,
  ownerOnly: false,
  permissions: PermissionsBitField.Flags.ManageChannels,
  execute: async (interaction, client) => {
    return runWithLanguage(interaction.locale, async () => {
    const logger = require("../../Structures/Handlers/logger");


    const yetkiKontrol = await S.isManager(interaction);
    if (!yetkiKontrol) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription(
          `❌ ${t("You don't have the **Manage Channels** permission.")}`
        );
      return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    } else {
      if (interaction.options.getSubcommand() === 'edit') {
        const { handleBuilder } = await import('../../../src/panel-builder.js');
        return handleBuilder(interaction, { editExisting: true });
      }
      if (interaction.options.getSubcommand() === 'setup') {
        const { startSetup } = await import('../../../src/setup.js');
        return startSetup(interaction);
      }

      if (interaction.options.getSubcommand() === "config") {
        const logChannel = interaction.options.getChannel("log-channel");
        const duration = interaction.options.getString("autoclose-duration");
        const ms = require('ms');
        let updates = {};
        let replyMessages = [];

        if (logChannel) {
            const settings = await serverDB.findOne({ guildId: interaction.guildId });
            if (!settings?.destekRole?.length) return interaction.reply({ content: t('Configure support roles first.'), flags: MessageFlags.Ephemeral });
            try {
              await S.privateLog(logChannel, settings, client.user.id);
              if (!S.canRead(logChannel, await S.actor(interaction))) throw new Error(t('You do not have permission to read the log channel.'));
            } catch (error) { return interaction.reply({ content: error.name === 'Error' ? t(error.message) : t('Unable to verify the private log channel.'), flags: MessageFlags.Ephemeral }); }
            updates.destekLogChannel = logChannel.id;
            replyMessages.push(t('Ticket log channel set to {channel}.', { channel: `<#${logChannel.id}>` }));
        }

        if (duration) {
            if (duration.toLowerCase() === 'kapat' || duration.toLowerCase() === 'disable') {
                updates['destekAutoClose.enabled'] = false;
                replyMessages.push(t('Automatic ticket closing disabled.'));
            } else {
                const durationMs = ms(duration);
                if (!Number.isFinite(durationMs) || durationMs < 3600000) { // Minimum 1 saat
                    const embed = new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ ${t('Invalid duration. Must be at least 1 hour.')}`);
                    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
                }
                updates['destekAutoClose.enabled'] = true;
                updates['destekAutoClose.duration'] = duration;
                replyMessages.push(t('Automatic ticket closing duration set to **{duration}**.', { duration }));
            }
        }

        if (Object.keys(updates).length === 0) {
            return interaction.reply({ content: t("You did not specify a setting to configure."), flags: [MessageFlags.Ephemeral] });
        }

        await serverDB.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: updates },
            { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle(t("Ticket System Configured"))
          .setDescription(replyMessages.map(m => `✅ ${m}`).join('\n'));
        return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      }

      if (interaction.options.getSubcommand() === "search") {
        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });
        if (!serverData || !serverData.destekLogChannel) {
            return interaction.editReply({
                content: t('A ticket log channel is not configured on this server. This feature is unavailable.')
            });
        }

        const logChannel = await interaction.guild.channels.fetch(serverData.destekLogChannel).catch(() => null);
        if (!logChannel) {
            return interaction.editReply({
                content: t('The ticket log channel could not be found. Please check the settings.')
            });
        }

        if (!S.canRead(logChannel, await S.actor(interaction))) return interaction.editReply({ content: t('You need View Channel and Read Message History permissions in the log channel.') });

        try {
            const messages = await logChannel.messages.fetch({ limit: 100 });
            const userTickets = [];

            const ticketClosedTitles = new Set(['Ticket Closed', 'Ticket Auto-Closed', 'Talep kapatıldı', 'Talep otomatik kapatıldı']);

            for (const message of messages.values()) {
                if (message.author.id !== interaction.client.user.id || !message.embeds.length) continue;
                const embed = message.embeds[0];
                if (ticketClosedTitles.has(embed.title)) {
                    const openedByField = embed.fields.find(f => ['Opened By', 'Açan kullanıcı'].includes(f.name));
                    const ticketIdField = embed.fields.find(f => ['Ticket ID', 'Talep numarası'].includes(f.name));
                    if (openedByField && openedByField.value.includes(targetUser.id) && ticketIdField) {
                        userTickets.push({
                            name: ticketIdField.value,
                            closedAt: embed.timestamp,
                            url: message.url
                        });
                    }
                }
            }

            if (userTickets.length === 0) {
                return interaction.editReply({
                    content: t('No past tickets found for **{user}**.', { user: targetUser.tag })
                });
            }

            const ticketsPerPage = 5;
            const totalPages = Math.ceil(userTickets.length / ticketsPerPage);
            let currentPage = 1;

            const generateEmbed = (page) => {
                const start = (page - 1) * ticketsPerPage;
                const end = start + ticketsPerPage;
                const currentTickets = userTickets.slice(start, end);

                const description = currentTickets.map(ticket =>
                    `🎫 **${ticket.name}** • [${t('View log')}](${ticket.url})\n> ${t('Closed')}: <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`
                ).join('\n\n');

                return new EmbedBuilder().setTitle(t('Past Tickets for {user}', { user: targetUser.username }).slice(0, 256)).setColor(Colors.Blue).setThumbnail(targetUser.displayAvatarURL()).setDescription(description).setFooter({ text: t('Page {page} / {total} ({count} total tickets)', { page, total: totalPages, count: userTickets.length }) });
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev_page').setEmoji('⬅️').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('next_page').setEmoji('➡️').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1)
            );

            const response = await interaction.editReply({ embeds: [generateEmbed(currentPage)], components: [row] });
            const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: t('Only the person who used the command can use these buttons.'), flags: [MessageFlags.Ephemeral] });
                if (!(await S.isManager(i)) || !S.canRead(logChannel, await S.actor(i))) return i.reply({ content: t('You need the Manage Channels permission.'), flags: MessageFlags.Ephemeral });
                if (i.customId === 'prev_page') currentPage--; else if (i.customId === 'next_page') currentPage++;
                row.components[0].setDisabled(currentPage === 1);
                row.components[1].setDisabled(currentPage === totalPages);
                await i.update({ embeds: [generateEmbed(currentPage)], components: [row] });
            });

            collector.on('end', () => { row.components.forEach(button => button.setDisabled(true)); interaction.editReply({ components: [row] }).catch(() => {}); });
            return;
        } catch (error) {
            logger.error('Ticket search failed:', error);
            return interaction.editReply({ content: t('An error occurred while searching for tickets.') });
        }
      }

      if (interaction.options.getSubcommandGroup(false) === "auto-response") {
        const subCommand = interaction.options.getSubcommand();
        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });

        switch (subCommand) {
            case 'add': {
                const keyword = interaction.options.getString('keyword').toLowerCase();
                const response = interaction.options.getString('response');

                const existing = serverData?.destekAutoResponses?.find(ar => ar.keyword === keyword);
                if (existing) {
                    return interaction.reply({ content: t(`An auto-response for this keyword already exists.`), flags: [MessageFlags.Ephemeral] });
                }

                await serverDB.updateOne(
                    { guildId: interaction.guild.id },
                    { $push: { destekAutoResponses: { keyword, response } } },
                    { upsert: true }
                );

                return interaction.reply({ content: `✅ ${t('Auto-response added for the keyword **{keyword}**.', { keyword })}`, flags: [MessageFlags.Ephemeral] });
            }
            case 'remove': {
                const keyword = interaction.options.getString('keyword');
                const result = await serverDB.updateOne(
                    { guildId: interaction.guild.id },
                    { $pull: { destekAutoResponses: { keyword: keyword } } }
                );

                if (result.modifiedCount > 0) {
                    return interaction.reply({ content: `✅ ${t('Auto-response for keyword **{keyword}** has been removed.', { keyword })}`, flags: [MessageFlags.Ephemeral] });
                } else {
                    return interaction.reply({ content: t(`No auto-response found for this keyword.`), flags: [MessageFlags.Ephemeral] });
                }
            }
            case 'list': {
                const autoResponses = serverData?.destekAutoResponses || [];
                if (autoResponses.length === 0) {
                    return interaction.reply({ content: t('No auto-responses have been set up.'), flags: [MessageFlags.Ephemeral] });
                }

                const description = autoResponses.map(ar => `**• ${ar.keyword}**\n> ${ar.response.substring(0, 100)}${ar.response.length > 100 ? '...' : ''}`).join('\n\n');

                const embed = new EmbedBuilder()
                    .setTitle(t('Automated Ticket Responses'))
                    .setColor(Colors.Blue)
                    .setDescription(description);

                return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }
        }
      }

      if (interaction.options.getSubcommand() === "disable") {
        await serverDB.updateOne(
          { guildId: interaction.guild.id },
          {
            $set: {
              destekRole: [],
              destekChannel: null,
              destekMesajKanal: null,
              destekkategoriListesi: [],
              destekLogChannel: null,
              destekAutoResponses: [],
              "destekAutoClose.enabled": false,
            },
            $unset: { setupOwner: '', setupExpires: '', setupDraft: '', panelMessageId: '' },
          }
        );
        const embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setDescription(
            `✅ ${t('Support system has been reset.')}`
          );
        interaction.reply({ embeds: [embed] });
      }
    }
    });
  },
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const guildId = interaction.guild.id;

    if (interaction.options.getSubcommandGroup(false) === 'auto-response' && focusedOption.name === 'keyword') {
        try {
            const serverData = await serverDB.findOne({ guildId: guildId });
            const autoResponses = serverData?.destekAutoResponses || [];

            if (autoResponses.length === 0) return await interaction.respond([]);

            const filtered = autoResponses.filter(ar => ar.keyword.toLowerCase().startsWith(focusedOption.value.toLowerCase()));

            await interaction.respond(filtered.map(ar => ({ name: ar.keyword, value: ar.keyword })).slice(0, 25));
        } catch (error) {
            const logger = require("../../Structures/Handlers/logger");
            logger.error("Ticket auto-response autocomplete failed:", error);
            await interaction.respond([]);
        }
    }
  }
};

localizeCommand(module.exports.data);
