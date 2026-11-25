const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, Colors, EmbedBuilder, Events, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, blockQuote, escapeMarkdown } = require('discord.js');
const { randomBytes } = require('node:crypto');
const { createTranscript } = require('discord-html-transcripts');
const Server = require('../../Structures/Schemas/Server');
const S = require('../../Structures/Handlers/security');
const logger = require('../../Structures/Handlers/logger');
const { t, runWithLanguage, language } = require('../../../i18n.cjs');
const pending = new Map();
const transcriptLimit = 2000;
const privateReply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });

function buttons(closed) {
  return new ActionRowBuilder().addComponents(...(closed ? [
    new ButtonBuilder().setCustomId('del').setLabel(t('Delete ticket')).setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('transcript').setLabel(t('Transcript')).setEmoji('📄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open').setLabel(t('Reopen')).setEmoji('🔓').setStyle(ButtonStyle.Success),
  ] : [
    new ButtonBuilder().setCustomId('claim_ticket').setLabel(t('Claim ticket')).setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('close').setLabel(t('Close ticket')).setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  ]));
}
function remember(i, data) {
  const now = Date.now();
  for (const [key, item] of pending) if (item.expires <= now) pending.delete(key);
  if (pending.size >= 10000) throw new Error(t('Too many pending forms. Please try again later.'));
  const id = randomBytes(12).toString('hex');
  pending.set(id, { ...data, user: i.user.id, guild: i.guildId, expires: now + 300000 });
  return id;
}
function consume(i, kind) {
  const id = i.customId.split(':')[1];
  const entry = pending.get(id);
  if (!entry || entry.kind !== kind || entry.user !== i.user.id || entry.guild !== i.guildId || entry.expires < Date.now()) return null;
  pending.delete(id);
  return entry;
}
async function transcript(channel) {
  return createTranscript(channel, {
    limit: transcriptLimit, returnType: 'attachment', filename: `${channel.id}.html`, poweredBy: false, saveImages: false,
    callbacks: { resolveChannel: async id => id === channel.id ? channel : null },
  });
}
async function transcriptTxt(channel) {
  const lines = [];
  let before;
  while (lines.length < transcriptLimit) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    const msgs = [...batch.values()];
    for (const m of msgs) {
      const time = new Date(m.createdTimestamp).toISOString();
      const author = m.author ? `${m.author.tag} (${m.author.id})` : 'Unknown';
      const body = [m.content, ...m.attachments.map(a => `[attachment: ${a.url}]`), ...m.embeds.map(e => `[embed: ${e.title || e.description || ''}]`)].filter(Boolean).join(' ');
      lines.push(`[${time}] ${author}: ${body}`);
      if (lines.length >= transcriptLimit) break;
    }
    before = msgs[msgs.length - 1]?.id;
    if (batch.size < 100) break;
  }
  lines.reverse();
  const text = lines.join('\n') || 'No messages.';
  return new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `${channel.id}.txt` });
}
async function writeLog(channel, settings, ticket, reason, closer) {
  if (!settings.destekLogChannel) return;
  try {
    const log = await channel.guild.channels.fetch(settings.destekLogChannel);
    await S.privateLog(log, settings, channel.client.user.id);
    const [html, txt] = await Promise.all([transcript(channel), transcriptTxt(channel)]);
    const openedAt = ticket.createdAt ? Math.floor(new Date(ticket.createdAt).getTime() / 1000) : null;
    const duration = ticket.createdAt ? `<t:${openedAt}:R>` : t('Unknown');
    const embed = new EmbedBuilder().setColor(Colors.Orange).setTitle(t('Ticket Closed')).addFields(
      { name: t('Ticket ID'), value: ticket.ticketName || channel.id, inline: true },
      { name: t('Category'), value: (ticket.category || t('General Support')).slice(0, 1024), inline: true },
      { name: t('Subject'), value: (ticket.subject || t('No subject')).slice(0, 1024), inline: true },
      { name: t('Opened By'), value: `<@${ticket.userId}>`, inline: true },
      { name: t('Closed By'), value: `<@${closer}>`, inline: true },
      { name: t('Claimed By'), value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : t('Not claimed'), inline: true },
      { name: t('Opened At'), value: openedAt ? `<t:${openedAt}:F> (${duration})` : t('Unknown'), inline: false },
      { name: t('Close Reason'), value: reason.slice(0, 1024) },
      { name: t('Description'), value: (ticket.description || t('No description provided.')).slice(0, 1024) },
    ).setFooter({ text: t('The transcript includes up to {limit} recent messages.', { limit: transcriptLimit }) }).setTimestamp();
    await log.send({ embeds: [embed], files: [html, txt], allowedMentions: { parse: [] } });
  } catch (error) { logger.error('Unable to send the transcript to the private log channel', error); }
}
async function closeTicket(channel, settings, ticket, reason, closer, locale) {
  return runWithLanguage(locale || ticket.locale || channel.guild.preferredLocale, () => closeLocalized(channel, settings, ticket, reason, closer));
}
async function closeLocalized(channel, settings, ticket, reason, closer) {
  if (ticket.closed) return;
  // Revoke access before writing the closed state; a failed permission change must not report success.
  await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false, SendMessages: false });
  const result = await Server.updateOne({ guildId: channel.guild.id, 'destekUser.channelId': channel.id }, {
    $set: { 'destekUser.$.closed': true, 'destekUser.$.claimedBy': null },
  });
  if (!result.matchedCount) throw new Error(t('Ticket record not found.'));
  await writeLog(channel, settings, ticket, reason, closer);
  await channel.setName(`closed-${ticket.ticketName || channel.id}`.slice(0, 100));
  await channel.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle(t('Ticket Closed')).setDescription(t('Closed by: {user}', { user: `<@${closer}>` })).addFields({ name: t('Reason'), value: reason.slice(0, 1000) })], components: [buttons(true)], allowedMentions: { parse: [] } });
}
async function createTicket(i, settings, category, subject, description) {
  const roles = await S.supportRoles(i.guild, settings.destekRole);
  const parent = await i.guild.channels.fetch(settings.destekChannel);
  if (parent?.type !== ChannelType.GuildCategory) throw new Error(t('Ticket category not found.'));
  const { PermissionsBitField: { Flags: P } } = require('discord.js');
  if (!parent.permissionsFor(i.guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageChannels, P.ManageRoles])) {
    throw new Error(t('The bot needs channel/permission management, messaging, history, embed and attachment permissions in the ticket category.'));
  }
  const reservationId = randomBytes(12).toString('hex');
  // One atomic predicate and insert per guild: simultaneous processes cannot reserve two slots for one user.
  const reserved = await Server.findOneAndUpdate({ guildId: i.guildId, destekChannel: settings.destekChannel, destekRole: settings.destekRole, 'destekUser.userId': { $ne: i.user.id } }, {
    $inc: { destekCount: 1 }, $push: { destekUser: { userId: i.user.id, reservationId, createdAt: new Date(), closed: false } },
  }, { returnDocument: 'after' });
  if (!reserved) throw new Error(t('You already have a ticket or the setup has changed.'));
  let channel;
  try {
    const ticketName = `ticket-${randomBytes(6).toString('hex')}`;
    channel = await i.guild.channels.create({ name: ticketName, type: ChannelType.GuildText, parent: parent.id,
      permissionOverwrites: S.ticketOverwrites(i.guildId, i.client.user.id, i.user.id, roles) });
    const result = await Server.updateOne({ guildId: i.guildId, 'destekUser.reservationId': reservationId }, {
      $set: { 'destekUser.$.channelId': channel.id, 'destekUser.$.ticketName': ticketName, 'destekUser.$.locale': language(i.locale), 'destekUser.$.subject': subject, 'destekUser.$.description': description, 'destekUser.$.category': category?.label || t('General Support') },
    });
    if (!result.matchedCount) throw new Error(t('Unable to create the ticket record.'));
    const icon = i.guild.iconURL?.();
    const embed = new EmbedBuilder().setColor('#57F287')
      .setAuthor({ name: `${i.guild.name} • ${t('Support ticket')}`.slice(0, 256), ...(icon ? { iconURL: icon } : {}) })
      .setTitle(`📁 ${category?.label || t('General Support')} • ${subject}`.slice(0, 256))
      .setDescription(blockQuote(t('Your ticket was created successfully. Our team will assist you as soon as possible.')))
      .addFields({ name: `👤 ${t('Ticket owner')}`, value: `<@${i.user.id}>`, inline: true },
        { name: `📂 ${t('Category')}`, value: escapeMarkdown(category?.label || t('General Support')), inline: true },
        { name: `📌 ${t('Subject')}`, value: escapeMarkdown(subject), inline: true },
        { name: `📝 ${t('User description')}`, value: blockQuote(escapeMarkdown(description || t('No description provided.'))).slice(0, 1024) },
        { name: `🎫 ${t('Ticket number')}`, value: String(reserved.destekCount), inline: true })
      .setFooter({ text: t('Use the buttons below to manage this ticket.') }).setTimestamp();
    await channel.send({ content: `👋 ${t('Welcome, {user}!', { user: `<@${i.user.id}>` })}\n${t('Support team: {roles}', { roles: roles.map(id => `<@&${id}>`).join(' ') })}`, embeds: [embed], components: [buttons(false)],
      allowedMentions: { parse: [], users: [i.user.id], roles } });
    for (const response of settings.destekAutoResponses || []) if (response.response) await channel.send({ content: response.response.slice(0, 2000), allowedMentions: { parse: [] } });
    await i.editReply({ content: t('Your ticket has been opened: {channel}', { channel }) });
  } catch (error) {
    let removed = !channel;
    if (channel) {
      try { await channel.delete('Ticket creation rolled back'); removed = true; }
      catch (cleanupError) { logger.error('Unable to clean up the ticket channel; keeping its record', cleanupError); }
    }
    if (removed) await Server.updateOne({ guildId: i.guildId }, { $pull: { destekUser: { reservationId } } });
    throw error;
  }
}

async function execute(i) {
  if (!i.inGuild()) return;
  const recognized = ['tic', 'kategori_secim', 'claim_ticket', 'close', 'open', 'del', 'transcript'].includes(i.customId) || /^ticket-(create|close):/.test(i.customId || '');
  if (!recognized) return;
  const settings = await Server.findOne({ guildId: i.guildId });
  return runWithLanguage(i.locale, () => executeLocalized(i, settings));
}
async function executeLocalized(i, settings) {
  if (!i.inGuild()) return;
  const isOpen = (i.isButton() && i.customId === 'tic') || (i.isStringSelectMenu() && i.customId === 'kategori_secim');
  const isCreateForm = i.isModalSubmit() && i.customId.startsWith('ticket-create:');
  const isCloseForm = i.isModalSubmit() && i.customId.startsWith('ticket-close:');
  const action = i.isButton() ? i.customId : isCloseForm ? 'close' : null;
  const controls = new Set(['claim_ticket', 'close', 'open', 'del', 'transcript']);
  if (!isOpen && !isCreateForm && !isCloseForm && !controls.has(action)) return;
  const member = await S.actor(i);
  if (!member) return privateReply(i, t('Unable to verify your server membership.'));
  if (!settings) return privateReply(i, t('The ticket system is not configured.'));
  if (isOpen || isCreateForm) {
    if (!settings.destekChannel || !settings.destekRole?.length) return privateReply(i, t('The ticket system is disabled or incomplete.'));
    if (isOpen) {
      if (!i.message || i.message.author.id !== i.client.user.id || i.message.id !== settings.panelMessageId || i.channelId !== settings.panelChannelId) return privateReply(i, t('This ticket panel is no longer valid.'));
      if (!S.rateLimit(`ticket-form:${i.guildId}:${i.user.id}`, 3, 30000)) return privateReply(i, t('Please wait a moment and try again.'));
      if (settings.destekUser.some(ticket => ticket.userId === i.user.id)) return privateReply(i, t('You already have a ticket channel.'));
      const category = i.isStringSelectMenu() ? settings.destekkategoriListesi.find(c => c.value === i.values[0]) : null;
      if (i.isStringSelectMenu() && !category) return privateReply(i, t('This category is no longer valid.'));
      const nonce = remember(i, { kind: 'create', category: category?.value, panel: settings.panelMessageId });
      await i.showModal(new ModalBuilder().setCustomId(`ticket-create:${nonce}`).setTitle(t('{category} - Ticket form', { category: category?.label || t('General Support') }).slice(0, 45)).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket_subject').setLabel(t('Subject')).setPlaceholder(t('Describe your issue briefly')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket_description').setLabel(t('Description')).setPlaceholder(t('Details you want to share with the support team')).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
      return;
    }
    const form = consume(i, 'create');
    if (!form || form.panel !== settings.panelMessageId) return privateReply(i, t('Form is invalid or expired.'));
    const category = form.category ? settings.destekkategoriListesi.find(c => c.value === form.category) : null;
    if (form.category && !category) return privateReply(i, t('This category has been removed.'));
    if (!S.rateLimit(`ticket-create:${i.guildId}:${i.user.id}`, 2, 60000)) return privateReply(i, t('You are opening tickets too quickly. Please wait.'));
    const subject = i.fields.getTextInputValue('ticket_subject').trim().slice(0, 200);
    if (!subject) return privateReply(i, t('The subject cannot be empty.'));
    const description = i.fields.getTextInputValue('ticket_description').trim().slice(0, 1000);
    if (!description) return privateReply(i, t('The description cannot be empty.'));
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await createTicket(i, settings, category, subject, description);
    return;
  }
  const ticket = settings.destekUser.find(item => item.channelId === i.channelId);
  const ownerClosing = ticket?.userId === i.user.id && action === 'close';
  if (!ticket || (!S.isStaff(member, settings) && !ownerClosing) || !S.canRead(i.channel, member)) return privateReply(i, t('You do not have permission to perform this ticket action.'));
  if (i.isButton() && i.message?.author.id !== i.client.user.id) return privateReply(i, 'Use the bot’s ticket message for this action.');
  if (action === 'close' && !isCloseForm) {
    if (ticket.closed) return privateReply(i, t('This ticket is already closed.'));
    const nonce = remember(i, { kind: 'close', channel: i.channelId });
    await i.showModal(new ModalBuilder().setCustomId(`ticket-close:${nonce}`).setTitle(t('Close ticket')).addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel(t('Closing reason (optional)')).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))));
    return;
  }
  if (isCloseForm) {
    const form = consume(i, 'close');
    if (!form || form.channel !== i.channelId) return privateReply(i, t('The closing form is invalid or expired.'));
  }
  const release = S.tryLock(`ticket:${i.guildId}:${i.channelId}`);
  if (!release) return privateReply(i, t('Another action is in progress on this ticket.'));
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const latest = await Server.findOne({ guildId: i.guildId });
    const current = latest?.destekUser.find(item => item.channelId === i.channelId);
    if (!current) throw new Error(t('The ticket record has been removed.'));
    if (action === 'transcript') {
      if (!S.rateLimit(`transcript:${i.guildId}:${i.user.id}`, 1, 30000)) return i.editReply({ content: t('Please wait 30 seconds before requesting another transcript.') });
      const file = await transcript(i.channel);
      await i.editReply({ files: [file], content: t('Up to {limit} recent messages.', { limit: transcriptLimit }) });
    } else if (action === 'del') {
      if (!current.closed) return i.editReply({ content: t('Close the ticket first.') });
      await i.channel.delete('Ticket deleted by support staff');
      await Server.updateOne({ guildId: i.guildId }, { $pull: { destekUser: { channelId: i.channelId } } });
    } else if (action === 'open') {
      if (!current.closed) return i.editReply({ content: t('This ticket is already open.') });
      await i.channel.permissionOverwrites.edit(current.userId, { ViewChannel: true, SendMessages: true });
      await Server.updateOne({ guildId: i.guildId, 'destekUser.channelId': i.channelId }, { $set: { 'destekUser.$.closed': false } });
      await i.channel.setName(current.ticketName || `ticket-${i.channelId}`);
      await i.message.edit({ components: [] });
      await i.channel.send({ content: t('Ticket reopened by: {user}', { user: `<@${i.user.id}>` }), components: [buttons(false)], allowedMentions: { parse: [] } });
      await i.editReply({ content: t('Ticket reopened.') });
    } else if (action === 'claim_ticket') {
      const result = await Server.updateOne({ guildId: i.guildId, destekUser: { $elemMatch: { channelId: i.channelId, closed: { $ne: true }, claimedBy: null } } }, { $set: { 'destekUser.$.claimedBy': i.user.id } });
      if (!result.modifiedCount) return i.editReply({ content: t('The ticket is closed or has already been claimed.') });
      await i.channel.send({ content: t('Ticket claimed by: {user}', { user: `<@${i.user.id}>` }), allowedMentions: { parse: [] } });
      await i.editReply({ content: t('You claimed the ticket.') });
    } else if (action === 'close') {
      if (current.closed) return i.editReply({ content: t('This ticket is already closed.') });
      const reason = i.fields.getTextInputValue('close_reason').trim().slice(0, 1000) || t('No reason provided');
      await closeTicket(i.channel, latest, current, reason, i.user.id, i.locale);
      await i.editReply({ content: t('Ticket closed.') });
    }
  } finally { release(); }
}
module.exports = { name: Events.InteractionCreate, execute, closeTicket, transcriptLimit };
