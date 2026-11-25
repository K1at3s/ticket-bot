import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, blockQuote } from 'discord.js';
import { defaultCategories, templatePanel } from './panel-templates.js';
import { handleBuilder } from './panel-builder.js';
const require = createRequire(import.meta.url);
const Server = require('./bot/Structures/Schemas/Server');
const S = require('./bot/Structures/Handlers/security');
const { translator, runWithLanguage, language } = require('./i18n.cjs');
const { parseCategories } = require('./categories.cjs');
const ttl = 15 * 60 * 1000;
const steps = ['category', 'channel', 'roles', 'control', 'mode', 'categories', 'review'];

function row(...components) { return new ActionRowBuilder().addComponents(...components); }
export function setupView(draft, guild) {
  const t = translator(draft.language);
  const custom = action => `setup:${draft.id}:${action}`;
  const button = (action, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(custom(action)).setLabel(t(label)).setEmoji(emoji).setStyle(style);
  const prompts = {
    category: ['Ticket category', 'Select the parent category for new ticket channels.'],
    channel: ['Panel channel', 'Select the text channel where members will open tickets.'],
    roles: ['Support team roles', 'Choose up to five roles that can view and reply to tickets.'],
    control: ['Opening control', 'Choose how members open tickets.'],
    mode: ['Panel creation', 'Use a ready-made design or build your own. Both options open an editable draft; nothing is published yet.'],
    categories: ['Ticket categories', 'Use ready-made categories or enter your own names and emoji. Descriptions are optional.'],
    review: ['Review your setup', 'Open the panel builder to preview and adjust your design before publishing.'],
  };
  const [title, description] = prompts[draft.step];
  const embed = new EmbedBuilder().setColor('#5865F2').setAuthor({ name: `${guild.name} • ${t('Ticket setup wizard')}`.slice(0, 256) })
    .setTitle(t(title)).setDescription(blockQuote(t(description))).setFooter({ text: t('Step {step} / {total}', { step: steps.indexOf(draft.step) + 1, total: steps.length }) });
  const icon = guild.iconURL?.(); if (icon) embed.setAuthor({ name: `${guild.name} • ${t('Ticket setup wizard')}`.slice(0, 256), iconURL: icon });
  let components;
  if (draft.step === 'category' || draft.step === 'channel') components = [row(new ChannelSelectMenuBuilder().setCustomId(custom(draft.step)).setMinValues(1).setMaxValues(1)
    .setChannelTypes(draft.step === 'category' ? ChannelType.GuildCategory : ChannelType.GuildText).setPlaceholder(`📁 ${t(title)}`))];
  if (draft.step === 'roles') components = [row(new RoleSelectMenuBuilder().setCustomId(custom('roles')).setMinValues(1).setMaxValues(5).setPlaceholder(`🛠️ ${t('Support team roles')}`))];
  if (draft.step === 'control') components = [row(button('button', 'Button', '🎫', ButtonStyle.Primary), button('select', 'Dropdown menu', '📂'))];
  if (draft.step === 'mode') components = [row(button('automatic', 'Automatic template', '✨', ButtonStyle.Primary), button('manual', 'Build manually', '✏️'))];
  if (draft.step === 'categories') components = [row(button('defaults', 'Use default categories', '✨', ButtonStyle.Primary), button('custom', 'Custom categories', '✏️'))];
  if (draft.step === 'review') {
    embed.addFields({ name: `📁 ${t('Ticket category')}`, value: `<#${draft.category}>`, inline: true },
      { name: `💬 ${t('Panel channel')}`, value: `<#${draft.channel}>`, inline: true },
      { name: `🛠️ ${t('Support team roles')}`, value: draft.roles.map(id => `<@&${id}>`).join(' ') },
      { name: `🎛️ ${t('Opening control')}`, value: t(draft.control === 'select' ? 'Dropdown menu' : 'Button'), inline: true },
      { name: `🎨 ${t('Design')}`, value: t(draft.mode === 'automatic' ? 'Automatic template' : 'Build manually'), inline: true });
    if (draft.control === 'select') embed.addFields({ name: t('Ticket categories'), value: draft.categories.map(c => `${c.emoji?.id ? `<${c.emoji.animated ? 'a' : ''}:${c.emoji.name}:${c.emoji.id}>` : c.emoji?.name || '📂'} ${c.label}`).join('\n').slice(0, 1024) });
    components = [row(button('finish', 'Open panel builder', '🧩', ButtonStyle.Success))];
  }
  components.push(row(...(draft.step === 'category' ? [] : [button('back', 'Back', '⬅️')]), button('cancel', 'Cancel', '✖️')));
  return { content: null, embeds: [embed], components, allowedMentions: { parse: [] } };
}

export async function startSetup(i) {
  const t = translator(i.locale);
  if (!(await S.isManager(i))) return i.reply({ content: t('You need the Manage Channels permission.'), flags: MessageFlags.Ephemeral });
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const release = S.tryLock(`setup:${i.guildId}`);
  if (!release) return i.editReply({ content: t('Another setup action is in progress.') });
  try {
    const settings = await Server.findOne({ guildId: i.guildId });
    if (settings?.destekChannel && settings.destekRole?.length) return i.editReply({ content: t('The ticket system is already configured. Use /ticketsystem edit to edit the panel.') });
    if (settings?.setupExpires > new Date() && settings.setupOwner !== i.user.id) return i.editReply({ content: t('Another manager is configuring the system. Try again when their session expires.') });
    const draft = { id: randomBytes(12).toString('hex'), language: language(i.locale), step: 'category' };
    // Unique guildId also prevents a second process from creating a competing setup document.
    await Server.findOneAndUpdate({ guildId: i.guildId, $or: [{ setupExpires: { $lte: new Date() } }, { setupExpires: { $exists: false } }, { setupOwner: i.user.id }] },
      { $set: { setupOwner: i.user.id, setupExpires: new Date(Date.now() + ttl), setupDraft: draft } }, { upsert: true });
    await i.editReply(setupView(draft, i.guild));
  } finally { release(); }
}

export async function handleSetup(i) {
  if (!i.customId?.startsWith('setup:')) return false;
  const settings = await Server.findOne({ guildId: i.guildId });
  const draft = settings?.setupDraft ? structuredClone(settings.setupDraft) : null;
  const t = translator(i.locale);
  const [, id, action] = i.customId.split(':');
  const fail = async message => {
    const payload = { content: t(message), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
    if (i.deferred || i.replied) await i.followUp(payload); else await i.reply(payload);
  };
  if (!(await S.isManager(i)) || settings?.setupOwner !== i.user.id || !(settings?.setupExpires > new Date()) || !draft || !steps.includes(draft.step) || draft.id !== id) {
    await fail('This setup has expired, belongs to another user, or you lack permission.'); return true;
  }
  const release = S.tryLock(`setup:${i.guildId}`);
  if (!release) { await fail('Another setup action is in progress.'); return true; }
  try {
    const current = await Server.findOne({ guildId: i.guildId });
    if (current?.setupDraft?.id !== id || current.setupOwner !== i.user.id || !(current.setupExpires > new Date()) || current.setupDraft.step !== draft.step) throw new Error(t('This setup step is no longer active.'));
    const originalStep = draft.step;
    draft.language = language(i.locale);
    const expected = { category: 'category', channel: 'channel', roles: 'roles', button: 'control', select: 'control', automatic: 'mode', manual: 'mode', defaults: 'categories', custom: 'categories', categoriesform: 'categories', finish: 'review' };
    if (!['back', 'cancel'].includes(action) && (expected[action] !== draft.step)) throw new Error(t('This setup step is no longer active.'));
    if (action === 'custom') {
      await i.showModal(new ModalBuilder().setCustomId(`setup:${id}:categoriesform`).setTitle(t('Ticket categories')).addComponents(row(new TextInputBuilder().setCustomId('categories')
        .setLabel(t('Category list (one per line)')).setPlaceholder(t('General Support|🎫\nReport|🚩\nName|Optional description|Emoji')).setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true))));
      return true;
    }
    await i.deferUpdate();
    if (action === 'cancel') {
      await Server.updateOne({ guildId: i.guildId, setupOwner: i.user.id, 'setupDraft.id': id }, { $unset: { setupOwner: '', setupExpires: '', setupDraft: '' } });
      await i.editReply({ content: t('Setup cancelled.'), embeds: [], components: [] }); return true;
    }
    if (action === 'finish') {
      const category = await i.guild.channels.fetch(draft.category);
      const channel = await i.guild.channels.fetch(draft.channel);
      if (category?.type !== ChannelType.GuildCategory) throw new Error(t('Select a valid ticket category.'));
      if (channel?.type !== ChannelType.GuildText || !S.canPost(channel, await S.actor(i))) throw new Error(t('Select a valid panel channel.'));
      const roles = await S.supportRoles(i.guild, draft.roles);
      const updated = { ...(settings.toObject?.() || settings), destekChannel: draft.category, destekMesajKanal: draft.channel, destekRole: roles,
        destekkategoriListesi: draft.control === 'select' ? draft.categories : [] };
      const result = await Server.updateOne({ guildId: i.guildId, setupOwner: i.user.id, 'setupDraft.id': id, 'setupDraft.step': 'review', setupExpires: { $gt: new Date() } },
        { $set: { destekChannel: updated.destekChannel, destekMesajKanal: updated.destekMesajKanal, destekRole: roles, destekkategoriListesi: updated.destekkategoriListesi },
          $unset: { setupOwner: '', setupExpires: '', setupDraft: '' } });
      if (!result.matchedCount) throw new Error(t('This setup step is no longer active.'));
      const panel = draft.mode === 'automatic' ? templatePanel(draft.control, draft.language) : { appearance: 'none', control: draft.control, blocks: [], language: draft.language };
      await handleBuilder(i, { start: { settings: updated, channel: draft.channel, control: draft.control, panel } });
      return true;
    }
    if (action === 'back') {
      draft.step = steps[Math.max(0, steps.indexOf(draft.step) - 1)];
      if (draft.step === 'categories' && draft.control !== 'select') draft.step = 'mode';
    } else if (action === 'category' || action === 'channel') {
      const channel = await i.guild.channels.fetch(i.values[0]);
      if (action === 'category' && channel?.type !== ChannelType.GuildCategory) throw new Error(t('Select a valid ticket category.'));
      if (action === 'channel' && (channel?.type !== ChannelType.GuildText || !S.canPost(channel, await S.actor(i)))) throw new Error(t('Select a valid panel channel.'));
      draft[action] = channel.id; draft.step = action === 'category' ? 'channel' : 'roles';
    } else if (action === 'roles') { draft.roles = await S.supportRoles(i.guild, i.values); draft.step = 'control'; }
    else if (action === 'button' || action === 'select') { draft.control = action; draft.step = 'mode'; }
    else if (action === 'automatic' || action === 'manual') { draft.mode = action; draft.step = draft.control === 'select' ? 'categories' : 'review'; }
    else if (action === 'defaults' || action === 'categoriesform') {
      draft.categories = action === 'defaults' ? defaultCategories(draft.language) : runWithLanguage(draft.language, () => parseCategories(i.fields.getTextInputValue('categories')));
      draft.step = 'review';
    }
    const result = await Server.updateOne({ guildId: i.guildId, setupOwner: i.user.id, 'setupDraft.id': id, 'setupDraft.step': originalStep, setupExpires: { $gt: new Date() } }, { $set: { setupDraft: draft } });
    if (!result.matchedCount) throw new Error(t('This setup step is no longer active.'));
    await i.editReply(setupView(draft, i.guild));
  } catch (error) {
    if (i.deferred && !i.replied) await i.editReply(setupView(draft, i.guild)).catch(() => {});
    await fail(error.name === 'Error' ? error.message : 'Unable to complete setup. Check permissions and support roles.');
  }
  finally { release(); }
  return true;
}
