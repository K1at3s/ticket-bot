import i18n from './i18n.cjs';
const { t } = i18n;
import { createRequire } from 'node:module';
import { MessageFlags } from 'discord.js';
import { handleBuilder } from './panel-builder.js';

const require = createRequire(import.meta.url);
export const panelCommand = require('../bot/Commands/Ticket/panel.js').data;

export async function handlePanel(interaction) {
  if (await handleBuilder(interaction)) return true;
  if (interaction.customId?.startsWith('panel:')) {
    await interaction.reply({ content: t('This old panel preview has expired. Use /ticketpanel to open the multi-block builder.'), flags: MessageFlags.Ephemeral });
    return true;
  }
  return false;
}
