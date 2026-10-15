const {
  ComponentType,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ActionRowBuilder,
  AutoModerationActionOptions,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ModalBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const { SlashCommandBuilder } = require("discord.js");
const serverDB = require("../../Structures/Schemas/Server");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticketsystem")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .setNameLocalizations({ tr: "biletsistemi" })
    .setDescription("Manage the ticket system.")
    .setDescriptionLocalizations({ tr: "Bilet sistemini yönetin." })
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setNameLocalizations({ tr: "kurulum" })
        .setDescription("Starts the interactive setup for the ticket system.")
        .setDescriptionLocalizations({
          tr: "Bilet sistemi için interaktif kurulumu başlatır.",
        })
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("config")
        .setNameLocalizations({ tr: "yapılandır" })
        .setDescription("Configure additional settings for the ticket system.")
        .setDescriptionLocalizations({ tr: "Bilet sistemi için ek ayarları yapılandırın." })
        .addChannelOption((option) =>
          option
            .setName("log-channel")
            .setNameLocalizations({ tr: "log-kanalı" })
            .setDescription("The channel to send ticket logs to.")
            .setDescriptionLocalizations({ tr: "Bilet loglarının gönderileceği kanal." })
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption((option) =>
          option
            .setName("autoclose-duration")
            .setNameLocalizations({ tr: "otomatik-kapatma-süresi" })
            .setDescription("Set inactivity duration (e.g., 24h, 3d) or 'disable'.")
            .setDescriptionLocalizations({ tr: "Hareketsizlik süresini ayarlayın (örn: 24h, 3d) veya 'kapat' yazın." })
            .setRequired(false)
        )
    )
    .addSubcommand(sub => sub.setName('edit').setNameLocalizations({ tr: 'düzenle' })
      .setDescription('Edit the saved ticket panel, messages and embeds.')
      .setDescriptionLocalizations({ tr: 'Kayıtlı ticket panelini, mesajları ve embedleri düzenle.' }))
    .addSubcommandGroup((group) =>
      group
        .setName('auto-response')
        .setNameLocalizations({ tr: 'otomatik-yanıt' })
        .setDescription('Manage automated responses for tickets.')
        .setDescriptionLocalizations({ tr: 'Biletler için otomatik yanıtları yönetin.' })
        .addSubcommand((sub) =>
          sub
            .setName('add')
            .setNameLocalizations({ tr: 'ekle' })
            .setDescription('Add a new auto-response.')
            .setDescriptionLocalizations({ tr: 'Yeni bir otomatik yanıt ekle.' })
            .addStringOption((opt) => opt.setName('keyword').setNameLocalizations({ tr: 'anahtar-kelime' }).setDescription('The keyword to trigger the response.').setRequired(true))
            .addStringOption((opt) => opt.setName('response').setNameLocalizations({ tr: 'yanıt' }).setDescription('The automated message to send.').setRequired(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('remove')
            .setNameLocalizations({ tr: 'kaldır' })
            .setDescription('Remove an auto-response.')
            .setDescriptionLocalizations({ tr: 'Bir otomatik yanıtı kaldır.' })
            .addStringOption((opt) => opt.setName('keyword').setNameLocalizations({ tr: 'anahtar-kelime' }).setDescription('The keyword of the response to remove.').setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((sub) =>
          sub
            .setName('list')
            .setNameLocalizations({ tr: 'listele' })
            .setDescription('List all auto-responses.')
            .setDescriptionLocalizations({ tr: 'Tüm otomatik yanıtları listele.' })
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('search')
        .setNameLocalizations({ tr: 'ara' })
        .setDescription("Searches for a user's past tickets.")
        .setDescriptionLocalizations({ tr: 'Bir kullanıcının geçmiş biletlerini arar.' })
        .addUserOption(option =>
            option.setName('user')
                .setNameLocalizations({ tr: 'kullanıcı' })
                .setDescription('The user whose tickets you want to search.')
                .setDescriptionLocalizations({ tr: 'Biletlerini aramak istediğiniz kullanıcı.' })
                .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable") // Primary name is English
        .setNameLocalizations({ tr: "sıfırla" }) // Turkish localization
        .setDescription("Resets and disables the ticket system.") // Primary description is English
        .setDescriptionLocalizations({
          tr: "Bilet sistemini sıfırlar ve kapatır.", // Turkish localization
        })
    ),
  cooldown: 5000, //1 saniye = 1000 ms / cooldown olmasını istemezseniz 0 yazın.
  ownerOnly: false, //komutu sadece geliştiricinin kullanabilmesini istersen true olarak değiştir
  permissions: PermissionsBitField.Flags.ManageChannels,
  execute: async (interaction, client) => {
    const logger = require("../../Structures/Handlers/logger");
    const isTurkish = interaction.locale.startsWith("tr");

    let yetkiKontrol = interaction.member.permissions.has(
      PermissionsBitField.Flags.ManageChannels
    );
    if (!yetkiKontrol) {
      const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription(
          isTurkish
            ? `${client.config.emojis.x} **Kanalları Yönet** Yetkin bulunmuyor.`
            : `${client.config.emojis.x} You don't have the **Manage Channels** permission.`
        );
      return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    } else { // ephemeralı flags: MessageFlags.Ephemeral ile değiştirmeye gerek yok
      if (interaction.options.getSubcommand() === 'edit') {
        const { handleBuilder } = await import('../../../src/panel-builder.js');
        return handleBuilder(interaction, { editExisting: true });
      }
      if (interaction.options.getSubcommand() === "setup") {
        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });

        if (serverData && serverData.destekMesajKanal) {
          const command = client.application.commands.cache.find(c => c.name === 'ticketsystem');
          const embed = new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setDescription(
              isTurkish
                ? `Destek sistemi zaten <#${serverData.destekMesajKanal}> kanalında aktif.\nSıfırlamak için </biletsistemi sıfırla:${command?.id}> komutunu kullanabilirsiniz.`
                : `The support system is already active in the <#${serverData.destekMesajKanal}> channel.\nTo reset it, you can use the </ticketsystem disable:${command?.id}> command.`
            );
          return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }


        const rows = new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("channel")
            .setChannelTypes(ChannelType.GuildCategory)
            .setPlaceholder(
              isTurkish ? "Destek Talep Kategorisi" : "Support Ticket Category"
            )
            .setMinValues(1)
            .setMaxValues(1)
        );
        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setDescription(
            isTurkish
              ? "Lütfen destek talepleri için bir kategori seçin."
              : "Please select a category for support tickets."
          );
        const linkembed = await interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [embed],
          components: [rows],
        });
        let filter = (i) => i.user.id === interaction.member.id;
        const collector = await linkembed.createMessageComponentCollector({
          filter, time: 300000, // Setup expires after five minutes
        });
        collector.on("collect", (i) => { void (async () => {
          if (i.customId === "channel") {
            await i.deferUpdate().catch(() => {});
            const categoryId = i.values[0];

            // Kategori kaydet
            await serverDB.findOneAndUpdate(
              { guildId: interaction.guild.id },
              { $set: { destekChannel: categoryId } },
              { upsert: true }
            );

            // 2. adım: kanal select menüsünü göster
            const kanalSecimRow = new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("mesajkanali")
                .setPlaceholder(
                  isTurkish
                    ? "Talep mesajının gönderileceği kanal"
                    : "Channel where the ticket message will be sent"
                )
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
            );

            const yeniEmbed = new EmbedBuilder()
              .setColor(Colors.Blurple)
              .setDescription(
                isTurkish
                  ? `Talep mesajının gönderileceği kanalı seçin.`
                  : `Select the channel where the ticket message will be sent.`
              );

            await linkembed.edit({
              embeds: [yeniEmbed],
              components: [kanalSecimRow],
            });
          }

          if (i.customId === "mesajkanali") {
            await i.deferUpdate().catch(() => {});
            const kanalId = i.values[0];

            await serverDB.findOneAndUpdate(
              { guildId: interaction.guild.id },
              { $set: { destekMesajKanal: kanalId } }
            );

            const yontemRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId("yontem_buton")
                .setLabel(
                  isTurkish
                    ? "📩 Butonlu Talep Sistemi"
                    : "📩 Button-based Ticket System"
                )
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId("yontem_kategori")
                .setLabel(
                  isTurkish
                    ? "📂 Category-based System"
                    : "📂 Category Selection System"
                )
                .setStyle(ButtonStyle.Secondary)
            );

            const yontemEmbed = new EmbedBuilder()
              .setColor(Colors.Blue)
              .setDescription(
                isTurkish
                  ? "📌 Destek sistemi nasıl çalışsın? Aşağıdan bir yöntem seçin:"
                  : "📌 How should the support system work? Choose a method below:"
              );

            await interaction.editReply({
              embeds: [yontemEmbed],
              components: [yontemRow],
            });
          }

          if (i.customId === "yontem_buton") {
            await i.deferUpdate().catch(() => {});

            const destekKanalId = (
              await serverDB.findOne({ guildId: interaction.guild.id })
            )?.destekMesajKanal;
            const destekKanal =
              interaction.guild.channels.cache.get(destekKanalId);

            if (!destekKanal) return;

            const roleRow = new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId("role_buton_setup")
                .setPlaceholder(
                  isTurkish ? "Destek Ekibi Rolleri" : "Support Team Roles"
                )
                .setMinValues(1)
                .setMaxValues(5)
            );

            const roleEmbed = new EmbedBuilder()
              .setColor(Colors.Green)
              .setDescription(
                isTurkish
                  ? "Lütfen destek ekibi rollerini seçin."
                  : "Please select the support team roles."
              );

            await interaction.editReply({
              embeds: [roleEmbed],
              components: [roleRow],
            });

            const roleFilter = (r) =>
              r.customId === "role_buton_setup" &&
              r.user.id === interaction.user.id;
            const roleInt = await linkembed
              .awaitMessageComponent({ filter: roleFilter, time: 120000 })
              .catch(() => null);
            if (!roleInt) return;

            await roleInt.deferUpdate().catch(() => {});
            const roleIds = roleInt.values;
            await serverDB.findOneAndUpdate(
              { guildId: interaction.guild.id },
              { $set: { destekRole: roleIds } }
            );

            const { panelSetup } = require('../../Structures/Handlers/panelSetup');
            await interaction.editReply(panelSetup(interaction.user.id, destekKanalId, 'button'));
            collector.stop();
          }
        })().catch(error => logger.error("Ticket setup failed", error)); });
      }

      if (interaction.options.getSubcommand() === "config") {
        const logChannel = interaction.options.getChannel("log-channel");
        const duration = interaction.options.getString("autoclose-duration");
        const ms = require('ms');
        let updates = {};
        let replyMessages = [];

        if (logChannel) {
            updates.destekLogChannel = logChannel.id;
            replyMessages.push(isTurkish ? `Bilet log kanalı <#${logChannel.id}> olarak ayarlandı.` : `Ticket log channel set to <#${logChannel.id}>.`);
        }

        if (duration) {
            if (duration.toLowerCase() === 'kapat' || duration.toLowerCase() === 'disable') {
                updates['destekAutoClose.enabled'] = false;
                replyMessages.push(isTurkish ? "Otomatik bilet kapatma özelliği devre dışı bırakıldı." : "Automatic ticket closing has been disabled.");
            } else {
                const durationMs = ms(duration);
                if (!Number.isFinite(durationMs) || durationMs < 3600000) { // Minimum 1 saat
                    const embed = new EmbedBuilder().setColor(Colors.Red).setDescription(isTurkish ? "❌ Geçersiz süre. Lütfen '24h', '3d' gibi geçerli bir formatta ve en az 1 saatlik bir süre girin." : "❌ Invalid duration. Please provide a valid format like '24h', '3d' and a duration of at least 1 hour.");
                    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
                }
                updates['destekAutoClose.enabled'] = true;
                updates['destekAutoClose.duration'] = duration;
                replyMessages.push(isTurkish ? `Otomatik bilet kapatma süresi **${duration}** olarak ayarlandı.` : `Automatic ticket closing duration set to **${duration}**.`);
            }
        }

        if (Object.keys(updates).length === 0) {
            return interaction.reply({ content: isTurkish ? "Yapılandırılacak bir ayar belirtmediniz." : "You did not specify a setting to configure.", flags: [MessageFlags.Ephemeral] });
        }

        await serverDB.findOneAndUpdate(
            { guildId: interaction.guild.id },
            { $set: updates },
            { upsert: true }
        );

        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle(isTurkish ? "Bilet Sistemi Yapılandırıldı" : "Ticket System Configured")
          .setDescription(replyMessages.map(m => `✅ ${m}`).join('\n'));
        return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      }

      if (interaction.options.getSubcommand() === "search") {
        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });
        if (!serverData || !serverData.destekLogChannel) {
            return interaction.editReply({
                content: isTurkish ? 'Bu sunucuda bir bilet log kanalı ayarlanmamış. Bu özellik kullanılamıyor.' : 'A ticket log channel is not configured on this server. This feature is unavailable.'
            });
        }

        const logChannel = await interaction.guild.channels.fetch(serverData.destekLogChannel).catch(() => null);
        if (!logChannel) {
            return interaction.editReply({
                content: isTurkish ? 'Bilet log kanalı bulunamadı. Lütfen ayarları kontrol edin.' : 'The ticket log channel could not be found. Please check the settings.'
            });
        }

        try {
            const messages = await logChannel.messages.fetch({ limit: 100 });
            const userTickets = [];

            const ticketClosedTitle = isTurkish ? 'Talep Kapatıldı' : 'Ticket Closed';
            const ticketAutoClosedTitle = isTurkish ? 'Talep Otomatik Kapatıldı' : 'Ticket Auto-Closed';
            const openedByFieldName = isTurkish ? 'Talebi Açan' : 'Opened By';
            const ticketIdFieldName = isTurkish ? 'Talep ID' : 'Ticket ID';

            for (const message of messages.values()) {
                if (message.author.id !== interaction.client.user.id || !message.embeds.length) continue;
                const embed = message.embeds[0];
                if (embed.title === ticketClosedTitle || embed.title === ticketAutoClosedTitle) {
                    const openedByField = embed.fields.find(f => f.name === openedByFieldName);
                    const ticketIdField = embed.fields.find(f => f.name === ticketIdFieldName);
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
                    content: isTurkish ? `**${targetUser.tag}** adına kayıtlı geçmiş bilet bulunamadı.` : `No past tickets found for **${targetUser.tag}**.`
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
                    `• ${ticket.name} - Loga Git\n  └ ${isTurkish ? 'Kapanma' : 'Closed'}: <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:R>`
                ).join('\n\n');

                return new EmbedBuilder().setTitle(isTurkish ? `${targetUser.username} Adına Geçmiş Biletler` : `Past Tickets for ${targetUser.username}`).setColor(Colors.Blue).setThumbnail(targetUser.displayAvatarURL()).setDescription(description).setFooter({ text: isTurkish ? `Sayfa ${page} / ${totalPages} (${userTickets.length} toplam bilet)` : `Page ${page} / ${totalPages} (${userTickets.length} total tickets)` });
            };

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev_page').setLabel('◀️').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('next_page').setLabel('▶️').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1)
            );

            const response = await interaction.editReply({ embeds: [generateEmbed(currentPage)], components: [row] });
            const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: isTurkish ? 'Bu butonları sadece komutu kullanan kişi kullanabilir.' : 'Only the person who used the command can use these buttons.', flags: [MessageFlags.Ephemeral] });
                if (i.customId === 'prev_page') currentPage--; else if (i.customId === 'next_page') currentPage++;
                row.components[0].setDisabled(currentPage === 1);
                row.components[1].setDisabled(currentPage === totalPages);
                await i.update({ embeds: [generateEmbed(currentPage)], components: [row] });
            });

            collector.on('end', () => { row.components.forEach(button => button.setDisabled(true)); interaction.editReply({ components: [row] }).catch(() => {}); });
        } catch (error) {
            logger.error('Bilet arama sırasında bir hata oluştu:', error);
            interaction.editReply({ content: isTurkish ? 'Biletler aranırken bir hata oluştu.' : 'An error occurred while searching for tickets.' });
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
                    return interaction.reply({ content: isTurkish ? `Bu anahtar kelime için zaten bir otomatik yanıt mevcut.` : `An auto-response for this keyword already exists.`, flags: [MessageFlags.Ephemeral] });
                }

                await serverDB.updateOne(
                    { guildId: interaction.guild.id },
                    { $push: { destekAutoResponses: { keyword, response } } },
                    { upsert: true }
                );

                return interaction.reply({ content: isTurkish ? `✅ Otomatik yanıt **${keyword}** anahtar kelimesi için eklendi.` : `✅ Auto-response added for the keyword **${keyword}**.`, flags: [MessageFlags.Ephemeral] });
            }
            case 'remove': {
                const keyword = interaction.options.getString('keyword');
                const result = await serverDB.updateOne(
                    { guildId: interaction.guild.id },
                    { $pull: { destekAutoResponses: { keyword: keyword } } }
                );

                if (result.modifiedCount > 0) {
                    return interaction.reply({ content: isTurkish ? `✅ **${keyword}** anahtar kelimesine ait otomatik yanıt kaldırıldı.` : `✅ Auto-response for keyword **${keyword}** has been removed.`, flags: [MessageFlags.Ephemeral] });
                } else {
                    return interaction.reply({ content: isTurkish ? `Bu anahtar kelimeye ait bir otomatik yanıt bulunamadı.` : `No auto-response found for this keyword.`, flags: [MessageFlags.Ephemeral] });
                }
            }
            case 'list': {
                const autoResponses = serverData?.destekAutoResponses || [];
                if (autoResponses.length === 0) {
                    return interaction.reply({ content: isTurkish ? 'Ayarlanmış otomatik yanıt bulunmuyor.' : 'No auto-responses have been set up.', flags: [MessageFlags.Ephemeral] });
                }

                const description = autoResponses.map(ar => `**• ${ar.keyword}**\n> ${ar.response.substring(0, 100)}${ar.response.length > 100 ? '...' : ''}`).join('\n\n');

                const embed = new EmbedBuilder()
                    .setTitle(isTurkish ? 'Otomatik Bilet Yanıtları' : 'Automated Ticket Responses')
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
          }
        );
        const embed = new EmbedBuilder()
          .setColor(Colors.Red)
          .setDescription(
            isTurkish
              ? `${client.config.emojis.check2} Destek sistemi sıfırlandı.`
              : `${client.config.emojis.check2} Support system has been reset.`
          );
        interaction.reply({ embeds: [embed] });
      }
    }
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
            logger.error("Bilet otomatik-yanıt autocomplete hatası:", error);
            await interaction.respond([]);
        }
    }
  }
};
