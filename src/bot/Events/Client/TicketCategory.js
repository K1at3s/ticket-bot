const { Events, MessageFlags } = require('discord.js');
const { t } = require('../../../i18n.cjs');
const { parseCategories } = require('../../../categories.cjs');

// Legacy setup controls must not mutate the new wizard's draft or saved configuration.
module.exports = {
  name: Events.InteractionCreate,
  parseCategories,
  async execute(interaction) {
    await interaction.reply({ content: t('This setup has expired, belongs to another user, or you lack permission.'), flags: MessageFlags.Ephemeral });
  },
};
