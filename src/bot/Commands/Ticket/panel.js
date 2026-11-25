const { PermissionsBitField, SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('Prepare and preview a ticket panel.')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    .addChannelOption(o => o.setName('channel').setDescription('Panel channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('control').setDescription('Ticket opening control').setRequired(false).addChoices(
      { name: 'Dropdown menu', value: 'select' }, { name: 'Button', value: 'button' }))
    .addStringOption(o => o.setName('mode').setDescription('Creation method (or choose in the builder)').addChoices({ name: 'Automatic template', value: 'automatic' }, { name: 'Build manually', value: 'manual' })),
  permissions: PermissionsBitField.Flags.ManageChannels,
  async execute(interaction) {
    const { handlePanel } = await import('../../../panel.js');
    await handlePanel(interaction);
  },
};

require('../../../i18n.cjs').localizeCommand(module.exports.data);
