const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const Server = require('../../Structures/Schemas/Server');
const { updateLabelComponents } = require('../../../src/panel-label.cjs');
module.exports = {
  data: new SlashCommandBuilder().setName('panel-label').setNameLocalizations({ tr: 'panel-yazısı' })
    .setDescription('Change the published ticket menu or button text.')
    .setDescriptionLocalizations({ tr: 'Gönderilmiş ticket menüsünün veya butonun yazısını değiştir.' })
    .setDMPermission(false).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addStringOption(o => o.setName('text').setNameLocalizations({ tr: 'yazı' })
      .setDescription('New menu or button text. Unicode emoji can be included.')
      .setDescriptionLocalizations({ tr: 'Yeni menü veya buton yazısı. Emoji de yazabilirsin.' })
      .setRequired(true).setMinLength(1).setMaxLength(150)),
  permissions: PermissionsBitField.Flags.ManageChannels,
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    try {
      const settings = await Server.findOne({ guildId: interaction.guildId });
      if (!settings?.panelChannelId || !settings.panelMessageId) throw new Error('Önce bir ticket paneli gönder.');
      const label = interaction.options.getString('text').trim();
      const channel = await interaction.guild.channels.fetch(settings.panelChannelId);
      if (!channel?.isTextBased()) throw new Error('Panel kanalı bulunamadı.');
      const message = await channel.messages.fetch(settings.panelMessageId);
      if (message.author.id !== interaction.client.user.id) throw new Error('Panel bu bota ait değil.');
      await message.edit({ components: updateLabelComponents(message.components, label) });
      await Server.updateOne({ guildId: interaction.guildId }, { $set: { 'panel.label': label } });
      await interaction.editReply({ content: `Menü / buton yazısı güncellendi: ${message.url}` });
    } catch (error) {
      await interaction.editReply({ content: error.name === 'Error' ? error.message : 'Yazı güncellenemedi. Panel mesajını ve bot yetkilerini kontrol et.' });
    }
  },
};
