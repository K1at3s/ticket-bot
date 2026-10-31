const { t } = require('./i18n.cjs');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const { translator } = require('./i18n.cjs');

function validatePanel(panel, categories) {
  if (!['embed', 'text', 'none'].includes(panel.appearance)) throw new Error(t('Invalid message appearance.'));
  if (!['select', 'button'].includes(panel.control)) throw new Error(t('Invalid component.'));
  if (panel.appearance === 'text' && !panel.body?.trim()) throw new Error(t('Message text cannot be empty.'));
  if (panel.appearance === 'embed' && !panel.body?.trim() && !panel.title?.trim() && !panel.image) throw new Error(t('Provide an embed title, description or image.'));
  if (panel.control === 'select' && (!categories?.length || categories.length > 25)) {
    throw new Error('Use /ticketsystem setup to create 1–25 categories first.');
  }
  if (panel.image) {
    let url;
    try { url = new URL(panel.image); } catch { throw new Error(t('Enter a valid image URL.')); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(t('The image URL must use HTTP or HTTPS.'));
  }
  if (panel.color && !/^#?[0-9a-f]{6}$/i.test(panel.color)) throw new Error(t('Use a HEX color such as #5865F2.'));
}

function buildPanel(panel, categories = [], { preview = false } = {}) {
  validatePanel(panel, categories);
  const t = translator(panel.language);
  const component = panel.control === 'select'
    ? new StringSelectMenuBuilder().setCustomId('kategori_secim').setPlaceholder(panel.label || t('Select a category to open a ticket')).addOptions(categories)
    : new ButtonBuilder().setCustomId('tic').setLabel(panel.label || t('Open a ticket')).setStyle(ButtonStyle.Primary);
  if (panel.control === 'button' && panel.buttonEmoji) component.setEmoji(panel.buttonEmoji);
  component.setDisabled(preview);
  const payload = { content: null, embeds: [], components: [new ActionRowBuilder().addComponents(component)], allowedMentions: { parse: [] } };
  if (panel.appearance === 'text') payload.content = panel.body;
  if (panel.appearance === 'embed') {
    const embed = new EmbedBuilder().setColor(parseInt((panel.color || '5865F2').replace('#', ''), 16));
    if (panel.body) embed.setDescription(panel.body);
    if (panel.title) embed.setTitle(panel.title);
    if (panel.image) embed.setImage(panel.image);
    payload.embeds = [embed];
  }
  return payload;
}

module.exports = { buildPanel, validatePanel };
