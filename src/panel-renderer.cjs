const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

function validatePanel(panel, categories) {
  if (!['embed', 'text', 'none'].includes(panel.appearance)) throw new Error('Geçersiz mesaj görünümü.');
  if (!['select', 'button'].includes(panel.control)) throw new Error('Geçersiz bileşen.');
  if (panel.appearance === 'text' && !panel.body?.trim()) throw new Error('Mesaj metni boş olamaz.');
  if (panel.appearance === 'embed' && !panel.body?.trim() && !panel.title?.trim() && !panel.image) throw new Error('Embed için başlık, metin veya görsel gir.');
  if (panel.control === 'select' && (!categories?.length || categories.length > 25)) {
    throw new Error('Liste için önce /ticketsystem setup ile 1–25 kategori oluştur.');
  }
  if (panel.image) {
    let url;
    try { url = new URL(panel.image); } catch { throw new Error('Geçerli bir görsel adresi gir.'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Görsel adresi HTTP veya HTTPS olmalı.');
  }
  if (panel.color && !/^#?[0-9a-f]{6}$/i.test(panel.color)) throw new Error('Renk #5865F2 biçiminde olmalı.');
}

function buildPanel(panel, categories = [], { preview = false } = {}) {
  validatePanel(panel, categories);
  const component = panel.control === 'select'
    ? new StringSelectMenuBuilder().setCustomId('kategori_secim').setPlaceholder(panel.label || 'Kategori seçerek talep oluştur').addOptions(categories)
    : new ButtonBuilder().setCustomId('tic').setLabel(panel.label || 'Talep oluştur').setStyle(ButtonStyle.Primary);
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
