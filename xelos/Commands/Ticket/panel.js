const { PermissionsBitField, SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Prepare and preview a ticket panel.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addChannelOption(o => o.setName('channel').setDescription('Panel channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('control').setDescription('Ticket opening control').setRequired(true).addChoices(
      { name: 'Select menu', value: 'select' }, { name: 'Button', value: 'button' })),
  permissions: PermissionsBitField.Flags.ManageChannels,
  async execute(interaction) {
    const { handlePanel } = await import('../../../src/panel.js');
    await handlePanel(interaction);
  },
};
