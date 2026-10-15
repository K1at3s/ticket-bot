const { PermissionsBitField, SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel').setNameLocalizations({ tr: 'biletpaneli' })
    .setDescription('Prepare and preview a ticket panel.').setDescriptionLocalizations({ tr: 'Ticket panelini hazırla ve önizle.' })
    .setDMPermission(false).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addChannelOption(o => o.setName('channel').setNameLocalizations({ tr: 'kanal' }).setDescription('Panel channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('control').setNameLocalizations({ tr: 'bilesen' }).setDescription('Ticket opening control').setRequired(true).addChoices(
      { name: 'Açılır liste', value: 'select' }, { name: 'Buton', value: 'button' })),
  permissions: PermissionsBitField.Flags.ManageChannels,
  async execute(interaction) {
    const { handlePanel } = await import('../../../src/panel.js');
    await handlePanel(interaction);
  },
};
