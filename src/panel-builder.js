import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionsBitField, ChannelType } from 'discord.js';
import { blockPayload, maxBlocks, moveBlock, newBlock, publishBlocks } from './panel-blocks.js';
import { resolveIdentity, validateWebhook, webhookMessages } from './panel-webhook.js';
const require = createRequire(import.meta.url);
const Server = require('../xelos/Structures/Schemas/Server.js');
const { buildPanel } = require('./panel-renderer.cjs');
const { actor, isManager, canPost, tryLock } = require('../xelos/Structures/Handlers/security');
const sessions = new Map();
const ttl = 30 * 60 * 1000;
const names = { text: 'Text', embed: 'Embed', image: 'Image embed' };

function button(id, action, label, disabled = false, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(`builder:${action}:${id}`).setLabel(label).setStyle(style).setDisabled(disabled);
}
function field(key, label, limit, value = '', required = false, paragraph = false) {
  const input = new TextInputBuilder().setCustomId(key).setLabel(label).setMaxLength(limit).setRequired(required).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short);
  if (value) input.setValue(value);
  return new ActionRowBuilder().addComponents(input);
}
function editor(id, type, block, key = 'new') {
  const modal = new ModalBuilder().setCustomId(`builder:form:${id}:${key}:${type}`).setTitle(`Edit ${names[type]}`);
  if (type === 'text') modal.addComponents(field('body', 'Message text', 2000, block?.body, true, true));
  if (type === 'embed') modal.addComponents(field('title', 'Title (optional)', 256, block?.title), field('body', 'Description (optional)', 4000, block?.body, false, true));
  if (type !== 'text') modal.addComponents(field('image', 'Image URL (setImage)', 1000, block?.image, type === 'image'), field('color', 'HEX color (optional)', 7, block?.color));
  if (type !== 'text') modal.addComponents(field('content', 'Message above embed / spacing (optional)', 2000, block?.content, false, true));
  return modal;
}
function migrate(panel) {
  if (Array.isArray(panel?.blocks)) return structuredClone(panel.blocks);
  if (!panel) return [];
  const blocks = [];
  for (const [, enabled, payload] of webhookMessages(panel)) {
    if (!enabled) continue;
    if (payload.content) blocks.push(newBlock('text', { body: payload.content }));
    for (const embed of payload.embeds) blocks.push(newBlock(embed.title || embed.description ? 'embed' : 'image', {
      title: embed.title || '', body: embed.description || '', image: embed.image?.url || '',
      color: embed.color === undefined ? '' : `#${embed.color.toString(16).padStart(6, '0')}`,
    }));
  }
  return blocks;
}
function view(id, session) {
  const p = session.panel;
  const selected = p.blocks[session.selected];
  const lines = p.blocks.map((b, i) => `${i === session.selected ? '→' : '•'} ${i + 1}. ${names[b.type]} — ${(b.title || b.body || b.image || '').replace(/\s+/g, ' ').slice(0, 65)}`);
  const components = [new ActionRowBuilder().addComponents(
    button(id, 'addtext', 'Add text', p.blocks.length >= maxBlocks), button(id, 'addembed', 'Add embed', p.blocks.length >= maxBlocks),
    button(id, 'addimage', 'Add image embed', p.blocks.length >= maxBlocks))];
  if (p.blocks.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`builder:select:${id}`).setPlaceholder('Select a block to edit').addOptions(
    p.blocks.map((b, i) => ({ label: `${i + 1}. ${names[b.type]}: ${b.title || b.body || 'Image'}`.slice(0, 100), value: b.id, default: i === session.selected })))));
  components.push(new ActionRowBuilder().addComponents(
    button(id, 'edit', 'Edit selected block', !selected), button(id, 'delete', 'Delete', !selected, ButtonStyle.Danger),
    button(id, 'up', 'Move up', !selected || session.selected === 0), button(id, 'down', 'Move down', !selected || session.selected === p.blocks.length - 1),
    button(id, 'preview', 'Preview block', !selected)));
  components.push(new ActionRowBuilder().addComponents(button(id, 'settings', 'Webhook / Menu text'), button(id, 'publish', 'Publish / Update', false, ButtonStyle.Success), button(id, 'cancel', 'Cancel')));
  components.push(...buildPanel({ ...p, appearance: 'none' }, session.categories, { preview: true }).components);
  return { content: `**Panel builder** — <#${session.channel}>\nBlocks are sent as separate webhook messages in order. The bot menu/button appears at the bottom.\n\n${lines.join('\n') || 'No blocks yet. Add text, an embed or an image.'}\n\n${p.blocks.length}/${maxBlocks} blocks.`, embeds: [], components, allowedMentions: { parse: [] } };
}

export async function handleBuilder(interaction, { editExisting = false } = {}) {
  const command = editExisting || (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel');
  if (!command && !interaction.customId?.startsWith('builder:')) return false;
  if (!(await isManager(interaction))) {
    await interaction.reply({ content: 'You need the Manage Channels permission.', flags: MessageFlags.Ephemeral }); return true;
  }
  try {
    const [, action, id, blockId, type] = interaction.customId?.split(':') || [];
    if (command || action === 'create') {
      const parts = interaction.customId?.split(':');
      if (!command && parts[4] !== interaction.user.id) throw new Error('This setup belongs to another user.');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const settings = await Server.findOne({ guildId: interaction.guildId });
      if (!settings?.destekChannel || !settings.destekRole?.length) throw new Error('Complete ticket setup first.');
      const channel = editExisting ? (settings.panelChannelId || settings.destekMesajKanal) : command ? interaction.options.getChannel('channel').id : parts[3];
      if (!channel) throw new Error('No panel channel found. Complete setup first.');
      const control = editExisting ? (settings.panel?.control || (settings.destekkategoriListesi?.length ? 'select' : 'button')) : command ? interaction.options.getString('control') : parts[2];
      const saved = command && settings.panelChannelId === channel ? settings.panel : null;
      for (const [key, s] of sessions) if (s.expires < Date.now()) sessions.delete(key);
      for (const [key, existing] of sessions) if (existing.owner === interaction.user.id && existing.guild === interaction.guildId) sessions.delete(key);
      if (sessions.size >= 10000) throw new Error('Too many open drafts. Please try again later.');
      const sessionId = randomBytes(12).toString('hex');
      const session = { owner: interaction.user.id, guild: interaction.guildId, channel, categories: settings.destekkategoriListesi || [],
        selected: 0, busy: false, expires: Date.now() + ttl, panel: { appearance: 'none', control,
          webhookName: saved?.webhookName || '{servername}', webhookAvatar: saved?.webhookAvatar || '{servericon}',
          label: saved?.label || '', blocks: migrate(saved) } };
      sessions.set(sessionId, session);
      await interaction.editReply(view(sessionId, session)); return true;
    }
    const session = sessions.get(id);
    if (!session || session.expires < Date.now()) throw new Error('This builder session expired. Run the command again.');
    if (session.owner !== interaction.user.id || session.guild !== interaction.guildId) throw new Error('This draft does not belong to you.');
    if (session.busy) throw new Error('The panel is being published. Please wait.');
    const selected = session.panel.blocks[session.selected];
    if (action.startsWith('add')) {
      if (session.panel.blocks.length >= maxBlocks) throw new Error('You can add up to 15 blocks.');
      await interaction.showModal(editor(id, action.slice(3))); return true;
    }
    if (action === 'edit') {
      if (!selected) throw new Error('Select a block first.');
      await interaction.showModal(editor(id, selected.type, selected, selected.id)); return true;
    }
    if (action === 'settings') {
      await interaction.showModal(new ModalBuilder().setCustomId(`builder:settingsform:${id}`).setTitle('Webhook and menu').addComponents(
        field('webhookName', 'Webhook name: {servername}', 80, session.panel.webhookName),
        field('webhookAvatar', 'Avatar URL or {servericon}', 1000, session.panel.webhookAvatar),
        field('label', 'Menu / Button text', session.panel.control === 'select' ? 150 : 80, session.panel.label)));
      return true;
    }
    if (action === 'preview') {
      if (!selected) throw new Error('Select a block first.');
      await interaction.reply({ ...blockPayload(selected), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }); return true;
    }
    if (action === 'cancel') {
      sessions.delete(id); await interaction.update({ content: 'Panel creation cancelled.', embeds: [], components: [] }); return true;
    }
    if (action === 'form') {
      const data = {};
      for (const key of ['title', 'body', 'image', 'color', 'content']) {
        const f = interaction.fields.fields.get(key); if (f) data[key] = key === 'content' ? f.value : f.value.trim();
      }
      const block = newBlock(type, data); blockPayload(block);
      if (blockId === 'new') {
        if (session.panel.blocks.length >= maxBlocks) throw new Error('You can add up to 15 blocks.');
        session.panel.blocks.push(block); session.selected = session.panel.blocks.length - 1;
      } else {
        const index = session.panel.blocks.findIndex(b => b.id === blockId);
        if (index < 0) throw new Error('This block has been deleted.');
        session.panel.blocks[index] = { ...block, id: blockId }; session.selected = index;
      }
    } else if (action === 'settingsform') {
      const candidate = { ...session.panel };
      for (const key of ['webhookName', 'webhookAvatar', 'label']) candidate[key] = interaction.fields.getTextInputValue(key).trim();
      validateWebhook(candidate); session.panel = candidate;
    } else if (action === 'select') {
      const index = session.panel.blocks.findIndex(b => b.id === interaction.values[0]);
      if (index < 0) throw new Error('Invalid block selection.');
      session.selected = index;
    }
    else if (action === 'delete') {
      if (!selected) throw new Error('Select a block first.');
      session.panel.blocks.splice(session.selected, 1); session.selected = Math.max(0, Math.min(session.selected, session.panel.blocks.length - 1));
    }
    else if (action === 'up' || action === 'down') session.selected = moveBlock(session.panel.blocks, session.selected, action === 'up' ? -1 : 1);
    else if (action === 'publish') {
      const release = tryLock(`panel:${interaction.guildId}`);
      if (!release) throw new Error('Another panel operation is in progress in this server.');
      session.busy = true;
      try {
        await interaction.deferUpdate();
        const settings = await Server.findOne({ guildId: interaction.guildId });
        if (!settings?.destekChannel || !settings.destekRole?.length) throw new Error('Ticket setup has been removed.');
        const channel = await interaction.guild.channels.fetch(session.channel);
        if (channel?.type !== ChannelType.GuildText) throw new Error('The target text channel was not found.');
        if (!canPost(channel, await actor(interaction))) throw new Error('You need View Channel and Send Messages permissions in the target channel.');
        const required = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory];
        if (session.panel.blocks.length || settings.panelWebhook) required.push(PermissionsBitField.Flags.ManageWebhooks, PermissionsBitField.Flags.EmbedLinks);
        if (!channel.permissionsFor(interaction.guild.members.me)?.has(required)) throw new Error('Check the bot’s messaging, history, embed and Manage Webhooks permissions in the target channel.');
        validateWebhook(session.panel);
        const payload = buildPanel(session.panel, settings.destekkategoriListesi);
        let previous;
        if (settings.panelChannelId === channel.id && settings.panelMessageId) {
          try { previous = await channel.messages.fetch(settings.panelMessageId); } catch (error) { if (error.code !== 10008) throw error; }
        }
        if (previous && previous.author.id !== interaction.client.user.id) throw new Error('The saved panel does not belong to this bot.');
        const header = await publishBlocks(session.panel, channel, settings.panelWebhook, interaction.client.user.id,
          state => Server.updateOne({ guildId: interaction.guildId }, { $set: { panelWebhook: state } }), resolveIdentity);
        const message = previous && !header.added ? await previous.edit(payload) : await channel.send(payload);
        await Server.updateOne({ guildId: interaction.guildId }, { $set: { panel: session.panel, panelChannelId: channel.id, panelMessageId: message.id, destekMesajKanal: channel.id } });
        if (previous && header.added) await previous.delete();
        sessions.delete(id);
        await interaction.editReply({ content: `Panel published: ${message.url}`, embeds: [], components: [] });
      } finally { session.busy = false; release(); }
      return true;
    } else throw new Error('Invalid action.');
    if (interaction.isModalSubmit()) {
      if (interaction.isFromMessage?.()) await interaction.update(view(id, session));
      else await interaction.reply({ ...view(id, session), flags: MessageFlags.Ephemeral });
    } else await interaction.update(view(id, session));
    return true;
  } catch (error) {
    const payload = { content: error.name === 'Error' ? error.message : 'Unable to complete the panel operation. Check permissions.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
    return true;
  }
}
