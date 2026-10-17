const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function panelSetup(owner, channel, control) {
  return {
    content: 'Add and edit separate text, embed and image blocks. Arrange their order; the bot menu/button stays at the bottom.',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`builder:create:${control}:${channel}:${owner}`).setLabel('Open panel builder').setStyle(ButtonStyle.Primary)
    )],
  };
}

module.exports = { panelSetup };
