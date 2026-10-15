const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  Events,
  ChannelType,
  ActionRowBuilder,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");
const serverDB = require("../../Structures/Schemas/Server");
const { createTranscript } = require("discord-html-transcripts");
const { randomBytes } = require('crypto');
const logger = require("../../Structures/Handlers/logger");

/**
 * Creates a new ticket channel based on the interaction and server settings.
 * @param {import('discord.js').Interaction} interaction The interaction that triggered the ticket creation.
 * @param {object} kategoriVeri The server's data from the database.
 * @param {object} [secilenKategori] The specific category selected by the user, if any.
 */
async function createTicketChannel(interaction, kategoriVeri, secilenKategori = null, subject = "Destek Talebi") {
  const isTurkish = interaction.locale.startsWith("tr");
  const roller = kategoriVeri.destekRole || [];
  const destekCount = (kategoriVeri.destekCount || 0) + 1;

  await serverDB.findOneAndUpdate(
    { guildId: interaction.guild.id },
    { $set: { destekCount } },
    { upsert: true }
  );

  // Her bilet için benzersiz, rastgele bir ID oluştur
  const ticketName = `ticket-${randomBytes(4).toString('hex')}`;

  const permissionOverwrites = [
    { id: interaction.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ManageChannels] },
    ...roller.map((roleId) => ({
      id: roleId,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles],
    })),
    {
      id: interaction.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.AttachFiles],
    },
  ];

  const destekKanal = await interaction.guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: kategoriVeri.destekChannel,
    permissionOverwrites,
  });

  const rolEtiket = roller.map((r) => `<@&${r}>`).join(", ");

  const embed = new EmbedBuilder()
    .setTitle(`Konu: ${subject}`)
    .setDescription(
      isTurkish
        ? `Talebiniz açıldı, yetkili ekip en kısa sürede ilgilenecektir.`
        : `Your ticket has been opened, the authorized team will assist you as soon as possible.`
    )
    .setColor(Colors.Green)
    .setTimestamp()
    .addFields(
      { name: isTurkish ? 'Kategori' : 'Category', value: `\`${secilenKategori ? secilenKategori.label : (isTurkish ? "Genel" : "General")}\``, inline: true },
      { name: isTurkish ? 'Talep No' : 'Ticket #', value: `\`#${destekCount}\``, inline: true }
    )
    .setAuthor({
      name: interaction.guild.name,
      iconURL: interaction.guild.iconURL({ dynamic: true }),
    });

  const ticketActionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel(isTurkish ? "✋ Talebi Üstlen" : "✋ Claim Ticket")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("close")
      .setLabel(isTurkish ? "🔒 Talebi Kapat" : "🔒 Close Ticket")
      .setStyle(ButtonStyle.Secondary)
  );

  await destekKanal.send({
    content: `${isTurkish ? "Hoş geldin" : "Welcome"} <@${interaction.user.id}> | ${rolEtiket}`,
    embeds: [embed],
    components: [ticketActionRow],
  });

  const autoResponses = kategoriVeri.destekAutoResponses || [];
  for (const ar of autoResponses) {
    if (ar.response) {
      await destekKanal.send({ content: ar.response }).catch(() => {});
    }
  }

  await serverDB.updateOne(
    { guildId: interaction.guild.id },
    { $push: { destekUser: { channelId: destekKanal.id, userId: interaction.user.id, claimedBy: null, ticketName, closed: false } } }
  );
  await interaction.editReply({ content: `Talebiniz açıldı: ${destekKanal}` });
}

module.exports = {
  name: Events.InteractionCreate,

  execute: async (interaction) => {
    const isTurkish = interaction.locale.startsWith("tr");

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "kategori_secim"
    ) {
      // Kullanıcının zaten talebi var mı kontrol et
      const kategoriVeri = await serverDB.findOne({ guildId: interaction.guild.id });
      const aktifTalep = kategoriVeri?.destekUser?.find(
        (u) => u.userId === interaction.user.id
      );
      if (aktifTalep) {
        return interaction.reply({
          content: isTurkish
            ? "❌ Zaten aktif bir destek talebiniz var."
            : "❌ You already have an active support ticket.",
          flags: [MessageFlags.Ephemeral],
        });
      }

      if (!kategoriVeri?.destekChannel) return interaction.reply({ content: 'Ticket sistemi ayarlanmamış.', flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder()
        .setCustomId(`create_ticket_subject_modal_cat:${interaction.values[0]}`)
        .setTitle(isTurkish ? 'Destek Talebi Oluştur' : 'Create Support Ticket');
      const subjectInput = new TextInputBuilder().setCustomId('ticket_subject').setMaxLength(200).setLabel(isTurkish ? "Talebinizin Konusu" : "Subject of your Ticket").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(isTurkish ? 'Örn: Siparişim gelmedi, bir kullanıcıyı şikayet etmek istiyorum...' : 'e.g., My order did not arrive, I want to report a user...');
      const actionRow = new ActionRowBuilder().addComponents(subjectInput);
      modal.addComponents(actionRow);
      await interaction.showModal(modal);

    }

    if (interaction.isButton()) {
      if (interaction.customId === "tic") {
        const kategoriVeri = await serverDB.findOne({ guildId: interaction.guild.id });

        if (!kategoriVeri || !kategoriVeri.destekChannel) {
            return interaction.reply({ content: isTurkish ? "Destek sistemi bu sunucuda ayarlanmamış." : "Ticket system is not configured on this server.", flags: [MessageFlags.Ephemeral] });
        }

        const aktifTalep = kategoriVeri?.destekUser?.find(u => u.userId === interaction.user.id);
        if (aktifTalep) {
          return interaction.reply({
            content: isTurkish
              ? "❌ Zaten aktif bir destek talebiniz var."
              : "❌ You already have an active support ticket.",
          flags: [MessageFlags.Ephemeral],
          });
        }

        const modal = new ModalBuilder()
            .setCustomId('create_ticket_subject_modal_btn')
            .setTitle(isTurkish ? 'Destek Talebi Oluştur' : 'Create Support Ticket');
        const subjectInput = new TextInputBuilder().setCustomId('ticket_subject').setMaxLength(200).setLabel(isTurkish ? "Talebinizin Konusu" : "Subject of your Ticket").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(isTurkish ? 'Örn: Siparişim gelmedi, bir kullanıcıyı şikayet etmek istiyorum...' : 'e.g., My order did not arrive, I want to report a user...');
        const actionRow = new ActionRowBuilder().addComponents(subjectInput);
        modal.addComponents(actionRow);
        await interaction.showModal(modal);

      } else if (interaction.customId === "claim_ticket") {
        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });

        // Yetki kontrolü
        const hasRole = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) || interaction.member.roles.cache.some(role => serverData.destekRole.includes(role.id));
        if (!hasRole && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ 
                content: isTurkish ? "❌ Bu talebi üstlenmek için yetkiniz yok." : "❌ You are not authorized to claim this ticket.", 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        const ticketInfo = serverData.destekUser.find(u => u.channelId === interaction.channel.id);
        if (ticketInfo.claimedBy) {
            return interaction.reply({ 
                content: isTurkish ? `Bu talep zaten <@${ticketInfo.claimedBy}> tarafından üstlenilmiş.` : `This ticket has already been claimed by <@${ticketInfo.claimedBy}>.`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        await interaction.deferUpdate();

        // DB Güncelle
        await serverDB.updateOne(
            { guildId: interaction.guild.id, "destekUser.channelId": interaction.channel.id },
            { $set: { "destekUser.$.claimedBy": interaction.user.id } }
        );

        // Mesajı güncelle
        const originalEmbed = interaction.message.embeds[0];
        const newEmbed = EmbedBuilder.from(originalEmbed)
            .addFields({ name: isTurkish ? "Üstlenen Yetkili" : "Claimed by", value: `<@${interaction.user.id}>` });

        // Butonları güncelle (Claim butonunu kaldır)
        const closeButton = new ButtonBuilder()
            .setCustomId("close")
            .setLabel(isTurkish ? "🔒 Talebi Kapat" : "🔒 Close Ticket")
            .setStyle(ButtonStyle.Secondary);
        const newRow = new ActionRowBuilder().addComponents(closeButton);

        await interaction.message.edit({ embeds: [newEmbed], components: [newRow] });
        await interaction.channel.send({ content: isTurkish ? `Bu talep <@${interaction.user.id}> tarafından üstlenildi.` : `This ticket has been claimed by <@${interaction.user.id}>.` });
      } else if (interaction.customId === "close") {
        const modal = new ModalBuilder()
            .setCustomId('close_ticket_modal')
            .setTitle(isTurkish ? 'Destek Talebini Kapat' : 'Close Support Ticket');
        const reasonInput = new TextInputBuilder().setCustomId('close_reason').setLabel(isTurkish ? "Kapatma Nedeni (İsteğe Bağlı)" : "Reason for closing (Optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder(isTurkish ? 'Talebin neden kapatıldığını kısaca açıklayın...' : 'Briefly explain why the ticket is being closed...');
        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);
        await interaction.showModal(modal);
      } else if (interaction.customId === "del") {
        await interaction.deferUpdate();
        const tiklananKanalID = interaction.channel.id;

        const serverData = await serverDB.findOne({
          guildId: interaction.guild.id,
        });
        const destekKanallari = serverData.destekUser || [];

        const bulunanKanalIndex = destekKanallari.findIndex(
          (channel) => channel.channelId === tiklananKanalID
        );

        if (bulunanKanalIndex !== -1) {
          destekKanallari.splice(bulunanKanalIndex, 1);
          await serverDB.updateOne(
            { guildId: interaction.guild.id },
            { $set: { destekUser: destekKanallari } }
          );
          await interaction.channel.delete();
        }
      } else if (interaction.customId === "open") {
        await interaction.deferUpdate();
        let user = await serverDB.findOne({ guildId: interaction.guild.id });
        let userCheck = user.destekUser.find(
          (c) => c.channelId === interaction.channel.id
        );
        let userID = userCheck.userId;
        await serverDB.updateOne({ guildId: interaction.guild.id, "destekUser.channelId": interaction.channel.id }, { $set: { "destekUser.$.closed": false } });
        await interaction.message.edit({ components: [] });
        await interaction.channel.permissionOverwrites
          .edit(userID, { ViewChannel: true })
          .then(async (msg) => {
            let mevcutKanalAdi = interaction.channel.name;
            let eskiIsim = isTurkish ? "kapalı-" : "closed-";
            let yeniIsim = isTurkish ? "destek-" : "ticket-";
            let yeniKanalAdi = mevcutKanalAdi.replace(eskiIsim, yeniIsim);
            await interaction.channel.setName(yeniKanalAdi);
            const closeEmbed = new EmbedBuilder()
              .setColor(Colors.Green)
              .setDescription(
                (isTurkish
                  ? "Destek talebini yeniden açan: <@"
                  : "Ticket reopened by: <@") +
                  interaction.member +
                  ">"
              );
            interaction.channel.send({ embeds: [closeEmbed] });
          });
      } else if (interaction.customId === "transcript") {
        await interaction.deferUpdate();
        const file = await createTranscript(interaction.channel, {
          limit: -1,
          returnType: "attachment",
          filename: `${interaction.channel.name}.html`,
          footerText: isTurkish
            ? "Toplam {number} adet mesaj var"
            : "There are {number} messages in total",
          poweredBy: false,
        });

        await interaction.followUp({ files: [file], flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('create_ticket_subject_modal')) {
        const subject = interaction.fields.getTextInputValue('ticket_subject');
        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });

        // Kullanıcının zaten talebi var mı diye son bir kontrol
        const aktifTalep = serverData?.destekUser?.find(u => u.userId === interaction.user.id);
        if (aktifTalep) {
            return interaction.reply({ content: isTurkish ? "❌ Zaten aktif bir destek talebiniz var." : "❌ You already have an active support ticket.", flags: [MessageFlags.Ephemeral] });
        }

        let secilenKategori = null;
        if (interaction.customId.startsWith('create_ticket_subject_modal_cat:')) {
            const kategoriValue = interaction.customId.split(':')[1];
            secilenKategori = serverData?.destekkategoriListesi?.find(k => k.value === kategoriValue);

            if (!secilenKategori) {
                return interaction.reply({
                    content: isTurkish ? "❌ Seçilen kategori veritabanında bulunamadı." : "❌ Selected category not found in the database.",
                    flags: [MessageFlags.Ephemeral],
                });
            }
        }

        await interaction.reply({
            content: isTurkish
                ? `✅ Talebiniz **${subject}** konusuyla oluşturuluyor...`
                : `✅ Your ticket is being created with the subject **${subject}**...`,
            flags: [MessageFlags.Ephemeral],
        });

        try {
            await createTicketChannel(interaction, serverData, secilenKategori, subject);
        } catch (error) {
            logger.error("Bilet oluşturma hatası:", error);
            await interaction.followUp({ content: isTurkish ? "Talebiniz oluşturulurken bir hata oluştu." : "An error occurred while creating your ticket.", flags: [MessageFlags.Ephemeral] });
        }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'close_ticket_modal') {
        await interaction.deferUpdate();
        const reason = interaction.fields.getTextInputValue('close_reason') || (isTurkish ? 'Neden belirtilmedi' : 'No reason provided');

        const serverData = await serverDB.findOne({ guildId: interaction.guild.id });
        const ticketInfo = serverData.destekUser.find(c => c.channelId === interaction.channel.id);
        
        if (!ticketInfo) return;

        // --- Transcript Logging ---
        if (serverData.destekLogChannel) {
            const logChannel = await interaction.guild.channels.fetch(serverData.destekLogChannel).catch(() => null);
            if (logChannel) {
                try {
                    const attachment = await createTranscript(interaction.channel, {
                        limit: -1,
                        returnType: 'attachment',
                        filename: `${interaction.channel.name}.html`,
                        poweredBy: false,
                    });

                    // Fetch first message to get subject and category
                    const firstMessage = await interaction.channel.messages.fetch({ after: 0, limit: 1 }).then(messages => messages.first());
                    const firstEmbed = firstMessage?.embeds?.[0];
                    
                    const subject = firstEmbed?.title?.replace('Konu: ', '') || (isTurkish ? 'Bilinmiyor' : 'Unknown');
                    const categoryField = firstEmbed?.fields?.find(f => f.name === (isTurkish ? 'Kategori' : 'Category'));
                    const category = categoryField?.value || `\`${isTurkish ? "Genel" : "General"}\``;
                    const creationTimestamp = Math.floor(interaction.channel.createdTimestamp / 1000);

                    const logEmbed = new EmbedBuilder()
                        .setColor(Colors.Orange)
                        .setTitle(isTurkish ? 'Talep Kapatıldı' : 'Ticket Closed')
                        .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
                        .addFields(
                            { name: isTurkish ? 'Talep ID' : 'Ticket ID', value: `\`${ticketInfo.ticketName || interaction.channel.name}\``, inline: false },
                            { name: isTurkish ? 'Konu' : 'Subject', value: subject, inline: false },
                            { name: isTurkish ? 'Talebi Açan' : 'Opened By', value: `<@${ticketInfo.userId}>`, inline: true },
                            { name: isTurkish ? 'Talebi Kapatan' : 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: isTurkish ? 'Üstlenen Yetkili' : 'Claimed By', value: ticketInfo.claimedBy ? `<@${ticketInfo.claimedBy}>` : (isTurkish ? 'Yok' : 'None'), inline: true },
                            { name: isTurkish ? 'Kategori' : 'Category', value: category, inline: true },
                            { name: isTurkish ? 'Açılış Zamanı' : 'Opened At', value: `<t:${creationTimestamp}:F>`, inline: true },
                            { name: isTurkish ? 'Kapanış Zamanı' : 'Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                            { name: isTurkish ? 'Kapatma Nedeni' : 'Close Reason', value: reason },
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed], files: [attachment] });
                } catch (err) {
                    logger.error("Bilet log'u gönderilemedi:", err);
                }
            }
        }

        // --- Channel Closing Logic ---
        await serverDB.updateOne({ guildId: interaction.guild.id, "destekUser.channelId": interaction.channel.id }, { $set: { "destekUser.$.claimedBy": null, "destekUser.$.closed": true } });
        const userID = ticketInfo.userId;
        await interaction.channel.permissionOverwrites.edit(userID, { ViewChannel: false });
        
        let mevcutKanalAdi = interaction.channel.name;
        let eskiIsim = isTurkish ? "destek-" : "ticket-";
        let yeniIsim = isTurkish ? "kapalı-" : "closed-";
        let yeniKanalAdi = mevcutKanalAdi.includes(eskiIsim) ? mevcutKanalAdi.replace(eskiIsim, yeniIsim) : `${yeniIsim}${mevcutKanalAdi}`;
        await interaction.channel.setName(yeniKanalAdi);

        const delRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("del").setLabel(isTurkish ? "🗑️ Talebi Sil" : "🗑️ Delete Ticket").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("transcript").setLabel(isTurkish ? "📄 Mesaj Geçmişi" : "📄 Transcript").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("open").setLabel(isTurkish ? "🔓 Talebi Aç" : "🔓 Reopen Ticket").setStyle(ButtonStyle.Success)
        );

        const closeEmbed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle(isTurkish ? 'Talep Kapatıldı' : 'Ticket Closed')
            .setDescription(`${isTurkish ? "Destek talebini kapatan" : "Ticket closed by"}: <@${interaction.member.id}>`)
            .addFields({ name: isTurkish ? 'Neden' : 'Reason', value: reason });

        await interaction.channel.send({ embeds: [closeEmbed], components: [delRow] });
    }
  },
};
