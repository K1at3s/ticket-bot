const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Colors, EmbedBuilder, Events, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { randomBytes } = require('node:crypto');
const { createTranscript } = require('discord-html-transcripts');
const Server = require('../../Structures/Schemas/Server');
const S = require('../../Structures/Handlers/security');
const logger = require('../../Structures/Handlers/logger');
const pending = new Map();
const transcriptLimit = 2000;
const privateReply = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral });

function buttons(closed) {
  return new ActionRowBuilder().addComponents(...(closed ? [
    new ButtonBuilder().setCustomId('del').setLabel('Delete ticket').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open').setLabel('Reopen').setStyle(ButtonStyle.Success),
  ] : [
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim ticket').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('close').setLabel('Close ticket').setStyle(ButtonStyle.Secondary),
  ]));
}
function remember(i, data) {
  const now = Date.now();
  for (const [key, item] of pending) if (item.expires <= now) pending.delete(key);
  if (pending.size >= 10000) throw new Error('Too many pending forms. Please try again later.');
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
async function writeLog(channel, settings, ticket, reason, closer) {
  if (!settings.destekLogChannel) return;
  try {
    const log = await channel.guild.channels.fetch(settings.destekLogChannel);
    await S.privateLog(log, settings, channel.client.user.id);
    const attachment = await transcript(channel);

    const embed = new EmbedBuilder().setColor(Colors.Orange).setTitle('Ticket Closed').addFields(
      { name: 'Ticket ID', value: ticket.ticketName || channel.id },
      { name: 'Opened By', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Closed By', value: `<@${closer}>`, inline: true },
      { name: 'Close Reason', value: reason.slice(0, 1000) },
    ).setFooter({ text: `The transcript includes up to ${transcriptLimit} recent messages.` }).setTimestamp();
    await log.send({ embeds: [embed], files: [attachment], allowedMentions: { parse: [] } });
  } catch (error) { logger.error('Unable to send the transcript to the private log channel', error); }
}
async function closeTicket(channel, settings, ticket, reason, closer) {
  if (ticket.closed) return;
  // Revoke access before writing the closed state; a failed permission change must not report success.
  await channel.permissionOverwrites.edit(ticket.userId, { ViewChannel: false, SendMessages: false });
  const result = await Server.updateOne({ guildId: channel.guild.id, 'destekUser.channelId': channel.id }, {
    $set: { 'destekUser.$.closed': true, 'destekUser.$.claimedBy': null },
  });
  if (!result.matchedCount) throw new Error('Ticket record not found.');
  await writeLog(channel, settings, ticket, reason, closer);
  await channel.setName(`closed-${ticket.ticketName || channel.id}`.slice(0, 100));
  await channel.send({ embeds: [new EmbedBuilder().setColor(Colors.Red).setTitle('Ticket Closed').setDescription(`Closed by: <@${closer}>`).addFields({ name: 'Reason', value: reason.slice(0, 1000) })], components: [buttons(true)], allowedMentions: { parse: [] } });
}
async function createTicket(i, settings, category, subject) {
  const roles = await S.supportRoles(i.guild, settings.destekRole);
  const parent = await i.guild.channels.fetch(settings.destekChannel);
  if (parent?.type !== ChannelType.GuildCategory) throw new Error('Ticket category not found.');
  const { PermissionsBitField: { Flags: P } } = require('discord.js');
  if (!parent.permissionsFor(i.guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.ManageChannels, P.ManageRoles])) {
    throw new Error('The bot needs channel/permission management, messaging, history, embed and attachment permissions in the ticket category.');
  }
  const reservationId = randomBytes(12).toString('hex');
  // One atomic predicate and insert per guild: simultaneous processes cannot reserve two slots for one user.
  const reserved = await Server.findOneAndUpdate({ guildId: i.guildId, destekChannel: settings.destekChannel, destekRole: settings.destekRole, 'destekUser.userId': { $ne: i.user.id } }, {
    $inc: { destekCount: 1 }, $push: { destekUser: { userId: i.user.id, reservationId, createdAt: new Date(), closed: false } },
  }, { returnDocument: 'after' });
  if (!reserved) throw new Error('You already have a ticket or the setup has changed.');
  let channel;
  try {
    const ticketName = `ticket-${randomBytes(6).toString('hex')}`;
    channel = await i.guild.channels.create({ name: ticketName, type: ChannelType.GuildText, parent: parent.id,
      permissionOverwrites: S.ticketOverwrites(i.guildId, i.client.user.id, i.user.id, roles) });
    const result = await Server.updateOne({ guildId: i.guildId, 'destekUser.reservationId': reservationId }, {
      $set: { 'destekUser.$.channelId': channel.id, 'destekUser.$.ticketName': ticketName },
    });
    if (!result.matchedCount) throw new Error('Unable to create the ticket record.');
    const embed = new EmbedBuilder().setColor(Colors.Green).setTitle(`Subject: ${subject}`).setDescription('The support team will assist you as soon as possible.').addFields(
      { name: 'Category', value: category?.label || 'General', inline: true }, { name: 'Ticket number', value: String(reserved.destekCount), inline: true });
    await channel.send({ content: `<@${i.user.id}> ${roles.map(id => `<@&${id}>`).join(' ')}`, embeds: [embed], components: [buttons(false)],
      allowedMentions: { parse: [], users: [i.user.id], roles } });
    for (const response of settings.destekAutoResponses || []) if (response.response) await channel.send({ content: response.response.slice(0, 2000), allowedMentions: { parse: [] } });
    await i.editReply({ content: `Your ticket has been opened: ${channel}` });
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
  const isOpen = (i.isButton() && i.customId === 'tic') || (i.isStringSelectMenu() && i.customId === 'kategori_secim');
  const isCreateForm = i.isModalSubmit() && i.customId.startsWith('ticket-create:');
  const isCloseForm = i.isModalSubmit() && i.customId.startsWith('ticket-close:');
  const action = i.isButton() ? i.customId : isCloseForm ? 'close' : null;
  const controls = new Set(['claim_ticket', 'close', 'open', 'del', 'transcript']);
  if (!isOpen && !isCreateForm && !isCloseForm && !controls.has(action)) return;
  const member = await S.actor(i);
  if (!member) return privateReply(i, 'Unable to verify your server membership.');
  const settings = await Server.findOne({ guildId: i.guildId });
  if (!settings) return privateReply(i, 'The ticket system is not configured.');
  if (isOpen || isCreateForm) {
    if (!settings.destekChannel || !settings.destekRole?.length) return privateReply(i, 'The ticket system is disabled or incomplete.');
    if (isOpen) {
      if (!i.message || i.message.author.id !== i.client.user.id || i.message.id !== settings.panelMessageId || i.channelId !== settings.panelChannelId) return privateReply(i, 'This ticket panel is no longer valid.');
      if (!S.rateLimit(`ticket-form:${i.guildId}:${i.user.id}`, 3, 30000)) return privateReply(i, 'Please wait a moment and try again.');
      if (settings.destekUser.some(ticket => ticket.userId === i.user.id)) return privateReply(i, 'You already have a ticket channel.');
      const category = i.isStringSelectMenu() ? settings.destekkategoriListesi.find(c => c.value === i.values[0]) : null;
      if (i.isStringSelectMenu() && !category) return privateReply(i, 'This category is no longer valid.');
      const nonce = remember(i, { kind: 'create', category: category?.value, panel: settings.panelMessageId });
      await i.showModal(new ModalBuilder().setCustomId(`ticket-create:${nonce}`).setTitle('Create ticket').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket_subject').setLabel('Subject').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200))));
      return;
    }
    const form = consume(i, 'create');
    if (!form || form.panel !== settings.panelMessageId) return privateReply(i, 'Form is invalid or expired.');
    const category = form.category ? settings.destekkategoriListesi.find(c => c.value === form.category) : null;
    if (form.category && !category) return privateReply(i, 'This category has been removed.');
    if (!S.rateLimit(`ticket-create:${i.guildId}:${i.user.id}`, 2, 60000)) return privateReply(i, 'You are opening tickets too quickly. Please wait.');
    const subject = i.fields.getTextInputValue('ticket_subject').trim().slice(0, 200);
    if (!subject) return privateReply(i, 'The subject cannot be empty.');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    await createTicket(i, settings, category, subject);
    return;
  }
  const ticket = settings.destekUser.find(item => item.channelId === i.channelId);
  const ownerClosing = ticket?.userId === i.user.id && action === 'close';
  if (!ticket || (!S.isStaff(member, settings) && !ownerClosing) || !S.canRead(i.channel, member)) return privateReply(i, 'You do not have permission to perform this ticket action.');
  if (i.isButton() && i.message?.author.id !== i.client.user.id) return privateReply(i, 'Use the bot’s ticket message for this action.');
  if (action === 'close' && !isCloseForm) {
    if (ticket.closed) return privateReply(i, 'This ticket is already closed.');
    const nonce = remember(i, { kind: 'close', channel: i.channelId });
    await i.showModal(new ModalBuilder().setCustomId(`ticket-close:${nonce}`).setTitle('Close ticket').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_reason').setLabel('Closing reason (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))));
    return;
  }
  if (isCloseForm) {
    const form = consume(i, 'close');
    if (!form || form.channel !== i.channelId) return privateReply(i, 'The closing form is invalid or expired.');
  }
  const release = S.tryLock(`ticket:${i.guildId}:${i.channelId}`);
  if (!release) return privateReply(i, 'Another action is in progress on this ticket.');
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const latest = await Server.findOne({ guildId: i.guildId });
    const current = latest?.destekUser.find(item => item.channelId === i.channelId);
    if (!current) throw new Error('The ticket record has been removed.');
    if (action === 'transcript') {
      if (!S.rateLimit(`transcript:${i.guildId}:${i.user.id}`, 1, 30000)) return i.editReply({ content: 'Please wait 30 seconds before requesting another transcript.' });
      const file = await transcript(i.channel);
      await i.editReply({ files: [file], content: `Up to ${transcriptLimit} recent messages.` });
    } else if (action === 'del') {
      if (!current.closed) return i.editReply({ content: 'Close the ticket first.' });
      await i.channel.delete('Ticket deleted by support staff');
      await Server.updateOne({ guildId: i.guildId }, { $pull: { destekUser: { channelId: i.channelId } } });
    } else if (action === 'open') {
      if (!current.closed) return i.editReply({ content: 'This ticket is already open.' });
      await i.channel.permissionOverwrites.edit(current.userId, { ViewChannel: true, SendMessages: true });
      await Server.updateOne({ guildId: i.guildId, 'destekUser.channelId': i.channelId }, { $set: { 'destekUser.$.closed': false } });
      await i.channel.setName(current.ticketName || `ticket-${i.channelId}`);
      await i.message.edit({ components: [] });
      await i.channel.send({ content: `Ticket reopened by: <@${i.user.id}>`, components: [buttons(false)], allowedMentions: { parse: [] } });
      await i.editReply({ content: 'Ticket reopened.' });
    } else if (action === 'claim_ticket') {
      const result = await Server.updateOne({ guildId: i.guildId, destekUser: { $elemMatch: { channelId: i.channelId, closed: { $ne: true }, claimedBy: null } } }, { $set: { 'destekUser.$.claimedBy': i.user.id } });
      if (!result.modifiedCount) return i.editReply({ content: 'The ticket is closed or has already been claimed.' });
      await i.channel.send({ content: `Ticket claimed by: <@${i.user.id}>`, allowedMentions: { parse: [] } });
      await i.editReply({ content: 'You claimed the ticket.' });
    } else if (action === 'close') {
      if (current.closed) return i.editReply({ content: 'This ticket is already closed.' });
      const reason = i.fields.getTextInputValue('close_reason').trim().slice(0, 1000) || 'No reason provided';
      await closeTicket(i.channel, latest, current, reason, i.user.id);
      await i.editReply({ content: 'Ticket closed.' });
    }
  } finally { release(); }
}
module.exports = { name: Events.InteractionCreate, execute, closeTicket, transcriptLimit };
