import { createRequire } from 'node:module';
import { MessageFlags } from 'discord.js';
import { handleBuilder } from './panel-builder.js';

const require = createRequire(import.meta.url);
export const panelCommand = require('../xelos/Commands/Ticket/panel.js').data;

export async function handlePanel(interaction) {
  if (await handleBuilder(interaction)) return true;
  if (interaction.customId?.startsWith('panel:')) {
    await interaction.reply({ content: 'Bu eski panel önizlemesi artık geçerli değil. /biletpaneli komutuyla çoklu parça oluşturucuyu aç.', flags: MessageFlags.Ephemeral });
    return true;
  }
  return false;
}
