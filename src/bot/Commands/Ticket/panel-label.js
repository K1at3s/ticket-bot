const { t, runWithLanguage, localizeCommand } = require('../../../i18n.cjs');
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const Server = require('../../Structures/Schemas/Server');
const { updateLabelComponents } = require('../../../panel-label.cjs');
const { actor, isManager, canPost, tryLock } = require('../../Structures/Handlers/security');
module.exports = {
  data: new SlashCommandBuilder().setName('panel-label')
    .setDescription('Change the published ticket menu or button text.')

    .setDMPermission(false).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addStringOption(o => o.setName('text')
      .setDescription('New menu or button text. Unicode emoji can be included.')

      .setRequired(true).setMinLength(1).setMaxLength(150)),
  permissions: PermissionsBitField.Flags.ManageChannels,
  async execute(interaction) {
    return runWithLanguage(interaction.locale, async () => {
    if (!(await isManager(interaction))) return interaction.reply({ content: t('You need the Manage Channels permission.'), flags: 64 });
    const release = tryLock(`panel:${interaction.guildId}`);
    if (!release) return interaction.reply({ content: t('A panel operation is in progress.'), flags: 64 });
    try {
    await interaction.deferReply({ flags: 64 });
    try {
      const settings = await Server.findOne({ guildId: interaction.guildId });
      if (!settings?.panelChannelId || !settings.panelMessageId) throw new Error(t('Publish a ticket panel first.'));
      const label = interaction.options.getString('text').trim();
      const channel = await interaction.guild.channels.fetch(settings.panelChannelId);
      if (!channel?.isTextBased()) throw new Error(t('The panel channel was not found.'));
      if (!canPost(channel, await actor(interaction))) throw new Error(t('You need View Channel and Send Messages permissions in the panel channel.'));
      const message = await channel.messages.fetch(settings.panelMessageId);
      if (message.author.id !== interaction.client.user.id) throw new Error(t('This panel does not belong to this bot.'));
      await message.edit({ components: updateLabelComponents(message.components, label) });
      await Server.updateOne({ guildId: interaction.guildId }, { $set: { 'panel.label': label } });
      await interaction.editReply({ content: t('Menu / button text updated: {url}', { url: message.url }) });
    } catch (error) {
      await interaction.editReply({ content: error.name === 'Error' ? t(error.message) : t('Unable to update the text. Check the panel message and bot permissions.') });
    }
    } finally { release(); }
    });
  },
};

localizeCommand(module.exports.data);
