const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function panelSetup(owner, channel, control) {
  return {
    content: 'Metin, embed ve görselleri ayrı parçalar olarak ekleyip düzenleyebilirsin. Sıralarını belirle; en altta botun menüsü/butonu olacak.',
    embeds: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`builder:create:${control}:${channel}:${owner}`).setLabel('Panel oluşturucuyu aç').setStyle(ButtonStyle.Primary)
    )],
  };
}

module.exports = { panelSetup };
