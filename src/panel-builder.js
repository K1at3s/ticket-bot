import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionsBitField, ChannelType } from 'discord.js';
import { blockPayload, maxBlocks, moveBlock, newBlock, publishBlocks } from './panel-blocks.js';
import { resolveIdentity, validateWebhook, webhookMessages } from './panel-webhook.js';
const require = createRequire(import.meta.url);
const Server = require('../bot/Structures/Schemas/Server.js');
const { buildPanel } = require('./panel-renderer.cjs');
const { actor, isManager, canPost, tryLock, privateLog } = require('../bot/Structures/Handlers/security');
const sessions = new Map();
const ttl = 30 * 60 * 1000;
const { t, runWithLanguage, language } = require('./i18n.cjs');
const { parseEmoji, parseCategories, formatCategories } = require('./categories.cjs');
const names = { text: t('Text'), embed: t('Embed'), image: t('Image embed') };
import { templatePanel, defaultCategories } from './panel-templates.js';

function button(id, action, label, disabled = false, style = ButtonStyle.Secondary) {
  const emoji = { addtext: '📝', addembed: '🧩', addimage: '🖼️', design: '🎨', categories: '📂', edit: '✏️', delete: '🗑️', up: '⬆️', down: '⬇️', preview: '👁️', settings: '⚙️', logchannel: '📜', publish: '🚀', cancel: '✖️', choosebutton: '🎫', chooseselect: '📂', chooseauto: '✨', choosemanual: '✏️', continue: '➡️' };
  return new ButtonBuilder().setCustomId(`builder:${action}:${id}`).setLabel(t(label)).setEmoji(emoji[action] || '🔹').setStyle(style).setDisabled(disabled);
}
function field(key, label, limit, value = '', required = false, paragraph = false) {
  const input = new TextInputBuilder().setCustomId(key).setLabel(t(label)).setMaxLength(limit).setRequired(required).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short);
  if (value) input.setValue(value);
  return new ActionRowBuilder().addComponents(input);
}
function editor(id, type, block, key = 'new') {
  const modal = new ModalBuilder().setCustomId(`builder:form:${id}:${key}:${type}`).setTitle(t('Edit {type}', { type: t(names[type]) }));
  if (type === 'text') modal.addComponents(field('body', t('Message text'), 2000, block?.body, true, true));
  if (type === 'embed') modal.addComponents(field('title', t('Title (optional)'), 256, block?.title), field('body', t('Description (optional)'), 4000, block?.body, false, true));
  if (type !== 'text') modal.addComponents(field('image', t('Image URL (setImage)'), 1000, block?.image, type === 'image'), field('color', t('HEX color (optional)'), 7, block?.color));
  if (type !== 'text') modal.addComponents(field('content', t('Message above embed / spacing (optional)'), 2000, block?.content, false, true));
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
  if (session.choosing) return {
    content: `**🎨 ${t('Panel creation')}**\n${t('Choose a control and a creation method. Your draft is private until you publish it.')}`,
    embeds: [], allowedMentions: { parse: [] }, components: [
      new ActionRowBuilder().addComponents(button(id, 'choosebutton', t('Button'), false, session.panel.control === 'button' ? ButtonStyle.Primary : ButtonStyle.Secondary), button(id, 'chooseselect', t('Dropdown menu'), false, session.panel.control === 'select' ? ButtonStyle.Primary : ButtonStyle.Secondary)),
      new ActionRowBuilder().addComponents(button(id, 'chooseauto', t('Automatic template'), false, session.mode === 'automatic' ? ButtonStyle.Primary : ButtonStyle.Secondary), button(id, 'choosemanual', t('Build manually'), false, session.mode === 'manual' ? ButtonStyle.Primary : ButtonStyle.Secondary)),
      new ActionRowBuilder().addComponents(button(id, 'continue', t('Continue'), false, ButtonStyle.Success), button(id, 'cancel', t('Cancel'))),
    ],
  };
  const p = session.panel;
  const selected = p.blocks[session.selected];
  const lines = p.blocks.map((b, i) => `${i === session.selected ? '▶' : '•'} ${i + 1}. ${t(names[b.type])} — ${(b.title || b.body || b.image || '').replace(/\s+/g, ' ').slice(0, 45)}`);
  const components = [new ActionRowBuilder().addComponents(
    button(id, 'addtext', t('Add text'), p.blocks.length >= maxBlocks), button(id, 'addembed', t('Add embed'), p.blocks.length >= maxBlocks),
    button(id, 'addimage', t('Add image embed'), p.blocks.length >= maxBlocks), button(id, 'design', t('Design')), button(id, 'categories', t('Ticket categories')))];
  if (p.blocks.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`builder:select:${id}`).setPlaceholder(t('Select a block to edit')).addOptions(
    p.blocks.map((b, i) => ({ label: `${i + 1}. ${t(names[b.type])}: ${b.title || b.body || t('Image embed')}`.slice(0, 100), value: b.id, default: i === session.selected })))));
  components.push(new ActionRowBuilder().addComponents(
    button(id, 'edit', t('Edit selected block'), !selected), button(id, 'delete', t('Delete'), !selected, ButtonStyle.Danger),
    button(id, 'up', t('Move up'), !selected || session.selected === 0), button(id, 'down', t('Move down'), !selected || session.selected === p.blocks.length - 1),
    button(id, 'preview', t('Preview block'), !selected)));
  components.push(new ActionRowBuilder().addComponents(button(id, 'settings', t('Webhook / Menu text')), button(id, 'logchannel', t('Log channel')), button(id, 'publish', t('Publish / Update'), false, ButtonStyle.Success), button(id, 'cancel', t('Cancel'))));
  components.push(...buildPanel({ ...p, appearance: 'none' }, session.categories, { preview: true }).components);
  const logLine = session.logChannel ? `\n${t('Log channel')}: <#${session.logChannel}>` : `\n${t('Log channel')}: ${t('Not set')}`;
  return { content: `**🧩 ${t('Panel builder')}** - <#${session.channel}>${logLine}\n${t('Blocks are sent as separate webhook messages in order. The bot menu/button appears at the bottom.')}\n\n${lines.join('\n') || t('No blocks yet. Add text, an embed or an image.')}\n\n${t('{count}/{max} blocks.', { count: p.blocks.length, max: maxBlocks })}`, embeds: [], components, allowedMentions: { parse: [] } };
}

export async function handleBuilder(interaction, options = {}) {
  const relevant = options.start || options.editExisting || (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel') || interaction.customId?.startsWith('builder:');
  if (!relevant) return false;
  return runWithLanguage(interaction.locale, () => builderInteraction(interaction, options));
}
async function builderInteraction(interaction, { editExisting = false, start } = {}) {
  const command = Boolean(start) || editExisting || (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel');
  if (!command && !interaction.customId?.startsWith('builder:')) return false;
  if (!(await isManager(interaction))) {
    await interaction.reply({ content: t('You need the Manage Channels permission.'), flags: MessageFlags.Ephemeral }); return true;
  }
  try {
    const [, action, id, blockId, type] = interaction.customId?.split(':') || [];
    if (command || action === 'create') {
      const parts = interaction.customId?.split(':');
      if (!command && parts[4] !== interaction.user.id) throw new Error(t('This setup belongs to another user.'));
      if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const settings = start?.settings || await Server.findOne({ guildId: interaction.guildId });
      if (!settings?.destekChannel || !settings.destekRole?.length) throw new Error(t('Complete ticket setup first.'));
      const channel = start?.channel || (editExisting ? (settings.panelChannelId || settings.destekMesajKanal) : command ? interaction.options.getChannel('channel').id : parts[3]);
      if (!channel) throw new Error(t('No panel channel found. Complete setup first.'));
      const control = start?.control || (editExisting ? (settings.panel?.control || (settings.destekkategoriListesi?.length ? 'select' : 'button')) : command ? interaction.options.getString('control') : parts[2]) || 'button';
      const saved = start?.panel || (command && settings.panelChannelId === channel ? settings.panel : null);
      for (const [key, s] of sessions) if (s.expires < Date.now()) sessions.delete(key);
      for (const [key, existing] of sessions) if (existing.owner === interaction.user.id && existing.guild === interaction.guildId) sessions.delete(key);
      if (sessions.size >= 10000) throw new Error(t('Too many open drafts. Please try again later.'));
      const sessionId = randomBytes(12).toString('hex');
      const session = { owner: interaction.user.id, guild: interaction.guildId, channel, logChannel: settings.destekLogChannel || null, categories: settings.destekkategoriListesi || [],
        selected: 0, busy: false, language: language(interaction.locale), choosing: !start && !editExisting && !saved, mode: 'manual', expires: Date.now() + ttl, panel: { appearance: 'none', control, language: language(interaction.locale), buttonEmoji: saved?.buttonEmoji || '',
          webhookName: saved?.webhookName || '{servername}', webhookAvatar: saved?.webhookAvatar || '{servericon}',
          label: saved?.label || '', blocks: migrate(saved) } };
      if (command && !start && !editExisting) {
        const mode = interaction.options.getString('mode');
        if (mode === 'automatic' || mode === 'manual') {
          session.mode = mode;
          session.choosing = !interaction.options.getString('control');
          if (mode === 'automatic' && !saved && !session.choosing) session.panel = templatePanel(control, session.language);
        }
      }
      if (!session.choosing && session.panel.control === 'select' && !session.categories.length) session.categories = defaultCategories(session.language);
      sessions.set(sessionId, session);
      await interaction.editReply(view(sessionId, session)); return true;
    }
    const session = sessions.get(id);
    if (!session || session.expires < Date.now()) throw new Error(t('This builder session expired. Run the command again.'));
    if (session.owner !== interaction.user.id || session.guild !== interaction.guildId) throw new Error(t('This draft does not belong to you.'));
    session.language = language(interaction.locale); session.panel.language = session.language;
    if (session.busy) throw new Error(t('The panel is being published. Please wait.'));
    if (action === 'design') { session.choosing = true; await interaction.update(view(id, session)); return true; }
    if (session.choosing && action !== 'cancel') {
      if (action === 'choosebutton' || action === 'chooseselect') session.panel.control = action === 'choosebutton' ? 'button' : 'select';
      else if (action === 'chooseauto' || action === 'choosemanual') session.mode = action === 'chooseauto' ? 'automatic' : 'manual';
      else if (action === 'continue') {
        if (session.panel.control === 'select' && !session.categories.length) session.categories = defaultCategories(session.language);
        if (session.mode === 'automatic') session.panel = { ...templatePanel(session.panel.control, session.language), webhookName: session.panel.webhookName, webhookAvatar: session.panel.webhookAvatar };
        session.choosing = false; session.selected = 0;
      } else throw new Error(t('Invalid action.'));
      await interaction.update(view(id, session)); return true;
    }
    if (action === 'categories') {
      const input = field('categories', t('Category list (one per line)'), 4000, formatCategories(session.categories), true, true);
      await interaction.showModal(new ModalBuilder().setCustomId(`builder:categoriesform:${id}`).setTitle(t('Ticket categories')).addComponents(input)); return true;
    }
    const selected = session.panel.blocks[session.selected];
    if (action.startsWith('add')) {
      if (session.panel.blocks.length >= maxBlocks) throw new Error(t('You can add up to 15 blocks.'));
      await interaction.showModal(editor(id, action.slice(3))); return true;
    }
    if (action === 'edit') {
      if (!selected) throw new Error(t('Select a block first.'));
      await interaction.showModal(editor(id, selected.type, selected, selected.id)); return true;
    }
    if (action === 'settings') {
      await interaction.showModal(new ModalBuilder().setCustomId(`builder:settingsform:${id}`).setTitle(t('Webhook and menu')).addComponents(
        field('webhookName', t('Webhook name: {servername}'), 80, session.panel.webhookName),
        field('webhookAvatar', t('Avatar URL or {servericon}'), 1000, session.panel.webhookAvatar),
        field('label', t('Menu / Button text'), session.panel.control === 'select' ? 150 : 80, session.panel.label), field('buttonEmoji', t('Button emoji (optional)'), 100, typeof session.panel.buttonEmoji === 'object' ? formatCategories([{ label: '', emoji: session.panel.buttonEmoji }]).slice(2) : session.panel.buttonEmoji)));
      return true;
    }
    if (action === 'logchannel') {
      await interaction.reply({ content: t('Select the ticket log channel.'), components: [new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`builder:logchannelselect:${id}`).setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1).setPlaceholder(t('Log channel')))], flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action === 'logchannelselect' && interaction.isChannelSelectMenu()) {
      const logChannel = interaction.channels.first();
      if (!logChannel || logChannel.type !== ChannelType.GuildText) throw new Error(t('Select a valid log channel.'));
      const settings = await Server.findOne({ guildId: interaction.guildId });
      if (!settings?.destekRole?.length) throw new Error(t('Configure support roles first.'));
      try {
        await privateLog(logChannel, settings, interaction.client.user.id);
        if (!canPost(logChannel, await actor(interaction))) throw new Error(t('You do not have permission to read the log channel.'));
      } catch (error) { throw error.name === 'Error' ? error : new Error(t('Unable to verify the private log channel.')); }
      session.logChannel = logChannel.id;
      await Server.updateOne({ guildId: interaction.guildId }, { $set: { destekLogChannel: logChannel.id } });
      await interaction.update({ content: t('Ticket log channel set to {channel}.', { channel: `<#${logChannel.id}>` }), components: [] });
      return true;
    }
    if (action === 'preview') {
      if (!selected) throw new Error(t('Select a block first.'));
      await interaction.reply({ ...blockPayload(selected), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }); return true;
    }
    if (action === 'cancel') {
      sessions.delete(id); await interaction.update({ content: t('Panel creation cancelled.'), embeds: [], components: [] }); return true;
    }
    if (action === 'form') {
      const data = {};
      for (const key of ['title', 'body', 'image', 'color', 'content']) {
        const f = interaction.fields.fields.get(key); if (f) data[key] = key === 'content' ? f.value : f.value.trim();
      }
      const block = newBlock(type, data); blockPayload(block);
      if (blockId === 'new') {
        if (session.panel.blocks.length >= maxBlocks) throw new Error(t('You can add up to 15 blocks.'));
        session.panel.blocks.push(block); session.selected = session.panel.blocks.length - 1;
      } else {
        const index = session.panel.blocks.findIndex(b => b.id === blockId);
        if (index < 0) throw new Error(t('This block has been deleted.'));
        session.panel.blocks[index] = { ...block, id: blockId }; session.selected = index;
      }
    } else if (action === 'categoriesform') {
      session.categories = parseCategories(interaction.fields.getTextInputValue('categories'));
    } else if (action === 'settingsform') {
      const candidate = { ...session.panel };
      for (const key of ['webhookName', 'webhookAvatar', 'label']) candidate[key] = interaction.fields.getTextInputValue(key).trim();
      const emoji = interaction.fields.getTextInputValue('buttonEmoji').trim(); candidate.buttonEmoji = parseEmoji(emoji) || '';
      validateWebhook(candidate); session.panel = candidate;
    } else if (action === 'select') {
      const index = session.panel.blocks.findIndex(b => b.id === interaction.values[0]);
      if (index < 0) throw new Error(t('Invalid block selection.'));
      session.selected = index;
    }
    else if (action === 'delete') {
      if (!selected) throw new Error(t('Select a block first.'));
      session.panel.blocks.splice(session.selected, 1); session.selected = Math.max(0, Math.min(session.selected, session.panel.blocks.length - 1));
    }
    else if (action === 'up' || action === 'down') session.selected = moveBlock(session.panel.blocks, session.selected, action === 'up' ? -1 : 1);
    else if (action === 'publish') {
      const release = tryLock(`panel:${interaction.guildId}`);
      if (!release) throw new Error(t('Another panel operation is in progress in this server.'));
      session.busy = true;
      try {
        await interaction.deferUpdate();
        const settings = await Server.findOne({ guildId: interaction.guildId });
        if (!settings?.destekChannel || !settings.destekRole?.length) throw new Error(t('Ticket setup has been removed.'));
        const channel = await interaction.guild.channels.fetch(session.channel);
        if (channel?.type !== ChannelType.GuildText) throw new Error(t('The target text channel was not found.'));
        if (!canPost(channel, await actor(interaction))) throw new Error(t('You need View Channel and Send Messages permissions in the target channel.'));
        const required = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory];
        if (session.panel.blocks.length || settings.panelWebhook) required.push(PermissionsBitField.Flags.ManageWebhooks, PermissionsBitField.Flags.EmbedLinks);
        if (!channel.permissionsFor(interaction.guild.members.me)?.has(required)) throw new Error(t('Check the bot’s messaging, history, embed and Manage Webhooks permissions in the target channel.'));
        validateWebhook(session.panel);
        const payload = buildPanel(session.panel, session.categories);
        let previous;
        if (settings.panelChannelId === channel.id && settings.panelMessageId) {
          try { previous = await channel.messages.fetch(settings.panelMessageId); } catch (error) { if (error.code !== 10008) throw error; }
        }
        if (previous && previous.author.id !== interaction.client.user.id) throw new Error(t('The saved panel does not belong to this bot.'));
        const header = await publishBlocks(session.panel, channel, settings.panelWebhook, interaction.client.user.id,
          state => Server.updateOne({ guildId: interaction.guildId }, { $set: { panelWebhook: state } }), resolveIdentity);
        const message = previous && !header.added ? await previous.edit(payload) : await channel.send(payload);
        await Server.updateOne({ guildId: interaction.guildId }, { $set: { destekkategoriListesi: session.categories, panel: session.panel, panelChannelId: channel.id, panelMessageId: message.id, destekMesajKanal: channel.id } });
        if (previous && header.added) await previous.delete();
        sessions.delete(id);
        await interaction.editReply({ content: t('Panel published: {url}', { url: message.url }), embeds: [], components: [] });
      } finally { session.busy = false; release(); }
      return true;
    } else throw new Error(t('Invalid action.'));
    if (interaction.isModalSubmit()) {
      if (interaction.isFromMessage?.()) await interaction.update(view(id, session));
      else await interaction.reply({ ...view(id, session), flags: MessageFlags.Ephemeral });
    } else await interaction.update(view(id, session));
    return true;
  } catch (error) {
    const payload = { content: t(error.name === 'Error' ? error.message : 'Unable to complete the panel operation. Check permissions.'), flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
    return true;
  }
}
