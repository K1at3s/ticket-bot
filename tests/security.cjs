const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { PermissionsBitField, OverwriteType, ChannelType, Collection, Events } = require('discord.js');
const P = PermissionsBitField.Flags;
const S = require('../xelos/Structures/Handlers/security');
const Server = require('../xelos/Structures/Schemas/Server');
const ticket = require('../xelos/Events/Client/TicketSystem');
const command = require('../xelos/Commands/Ticket/ticket-channel');
const category = require('../xelos/Events/Client/TicketCategory');
const labelCommand = require('../xelos/Commands/Ticket/panel-label');

function member(id, permissions = []) { return { id, permissions: new PermissionsBitField(permissions), roles: { cache: new Collection() } }; }
const owner = member('owner');
const stranger = member('stranger');
const manager = member('manager', [P.ManageChannels]);
const staff = member('staff-user'); staff.roles.cache.set('staff', { id: 'staff' });
let settings, creates, deleted, sent, replied, modal, queries, updates;
let failure = null;
let visible = true;
let currentMember = owner;
const channel = {
  id: 'ticket', type: ChannelType.GuildText, name: 'ticket-test', createdTimestamp: Date.now(),
  permissionsFor: () => new PermissionsBitField(visible ? [P.ViewChannel, P.ReadMessageHistory, P.SendMessages] : []),
  permissionOverwrites: { edit: async () => {} }, setName: async () => {},
  send: async payload => { if (failure === 'send' || failure === 'cleanup') throw new Error('Simulated Discord error'); sent.push(payload); },
  delete: async () => { if (failure === 'cleanup') throw new Error('Simulated delete error'); deleted++; },
};
const guild = {
  id: 'guild', name: 'Test', members: { fetch: async () => currentMember },
  roles: { fetch: async id => ({ id, managed: false }) },
  channels: { fetch: async id => id === 'category' ? { id, type: ChannelType.GuildCategory, permissionsFor: () => new PermissionsBitField(Object.values(P)) } : channel,
    create: async options => { creates.push(options); return channel; } },
};
channel.guild = guild; channel.client = { user: { id: 'bot' } };
function reset() {
  settings = { guildId: 'guild', destekChannel: 'category', destekRole: ['staff'], destekCount: 0, destekUser: [],
    panelMessageId: 'panel', panelChannelId: 'panel-channel', destekkategoriListesi: [{ label: 'General', value: 'general' }], destekAutoResponses: [] };
  creates = []; deleted = 0; sent = []; replied = null; modal = null; queries = []; updates = []; failure = null; visible = true; currentMember = owner;
}
function interaction(id = 'tic', options = {}) {
  return { customId: id, guild, guildId: 'guild', channel, channelId: 'ticket', locale: 'tr', client: { user: { id: 'bot' }, config: { emojis: { x: 'X' } } },
    user: { id: currentMember?.id || 'owner' }, member: currentMember, memberPermissions: new PermissionsBitField([P.ManageChannels]),
    inGuild: () => true, isButton: () => true, isStringSelectMenu: () => false, isModalSubmit: () => false,
    isChatInputCommand: () => false, isAutocomplete: () => false, isRepliable: () => true,
    message: { id: 'control', author: { id: 'bot' }, edit: async () => {} },
    fields: { getTextInputValue: () => 'A subject' },
    reply: async p => { replied = p; }, followUp: async p => { replied = p; }, editReply: async p => { replied = p; },
    deferReply: async () => {}, deferUpdate: async () => {}, showModal: async p => { modal = p.toJSON(); }, ...options };
}
Server.findOne = async () => settings;
Server.findOneAndUpdate = async (query, update) => {
  queries.push(query);
  if (update.$push?.destekUser) {
    assert.equal(typeof query['destekUser.userId'].$ne, 'string');
    if (settings.destekUser.some(t => t.userId === query['destekUser.userId'].$ne)) return null;
    settings.destekCount++;
    settings.destekUser.push({ ...update.$push.destekUser });
  }
  return settings;
};
Server.updateOne = async (query, update) => {
  updates.push({ query, update });
  if (update.$pull?.destekUser?.reservationId) settings.destekUser = settings.destekUser.filter(t => t.reservationId !== update.$pull.destekUser.reservationId);
  if (update.$set) {
    const item = settings.destekUser.find(t => query['destekUser.reservationId'] ? t.reservationId === query['destekUser.reservationId'] : t.channelId === query['destekUser.channelId']);
    for (const [key, value] of Object.entries(update.$set)) if (key.startsWith('destekUser.$.') && item) item[key.slice(13)] = value;
  }
  return { matchedCount: 1, modifiedCount: 1 };
};

async function openForm() {
  await ticket.execute(interaction('tic', { channelId: 'panel-channel', message: { id: 'panel', author: { id: 'bot' } } }));
  assert.ok(modal?.custom_id.startsWith('ticket-create:'));
  return modal.custom_id;
}
async function main() {
  reset();
  // Channel-scoped permission or a stale interaction permission field cannot grant guild management.
  assert.equal(await S.isManager(interaction()), false);
  currentMember = manager;
  assert.equal(await S.isManager(interaction()), true);
  currentMember = owner;
  const oldManagerInteraction = interaction('x', { member: manager });
  assert.equal(await S.isManager(oldManagerInteraction), false);
  currentMember = null;
  assert.equal(await S.isManager(interaction()), false);

  await assert.rejects(S.supportRoles(guild, ['guild']), /everyone/);
  assert.throws(() => S.ticketOverwrites('guild', 'bot', 'owner', ['guild']), /everyone/);
  const overwrites = S.ticketOverwrites('guild', 'bot', 'owner', ['staff', 'staff']);
  assert.equal(overwrites.filter(o => o.id === 'staff').length, 1);
  assert.ok(overwrites.find(o => o.id === 'guild').deny.includes(P.ViewChannel));
  assert.equal(overwrites.find(o => o.id === 'owner').type, OverwriteType.Member);
  assert.equal(overwrites.find(o => o.id === 'staff').type, OverwriteType.Role);
  const release = S.tryLock('test-lock'); assert.ok(release); assert.equal(S.tryLock('test-lock'), null); release();
  assert.equal(S.rateLimit('test-rate', 1, 1000, 0), true); assert.equal(S.rateLimit('test-rate', 1, 1000, 1), false); assert.equal(S.rateLimit('test-rate', 1, 1000, 1001), true);

  reset();
  const { handleBuilder } = await import(pathToFileURL(path.resolve(__dirname, '../src/panel-builder.js')));
  await handleBuilder(interaction('', { commandName: 'ticketpanel', isChatInputCommand: () => true }));
  assert.match(replied.content, /permission/);
  await labelCommand.execute(interaction()); assert.match(replied.content, /permission/);
  await command.execute(interaction('', { options: { getSubcommand: () => 'disable' } }), { config: { emojis: { x: 'X' } } });
  assert.equal(updates.length, 0);
  currentMember = manager;
  settings.setupOwner = 'other'; settings.setupExpires = new Date(Date.now() + 60000);
  await category.execute(interaction('role_category_setup', { values: ['guild'] }));
  assert.match(replied.content, /belongs to another user/); assert.equal(updates.length, 0);

  // Outsiders and ticket owners cannot use staff-only actions, even with forged channel permission hints.
  for (const acting of [owner, stranger]) {
    for (const action of ['del', 'open', 'transcript', 'claim_ticket']) {
      reset(); currentMember = acting; settings.destekUser = [{ channelId: 'ticket', userId: 'owner', closed: true }];
      await ticket.execute(interaction(action));
      assert.match(replied.content, /permission/); assert.equal(deleted, 0); assert.equal(updates.length, 0);
    }
  }
  reset(); currentMember = staff; visible = false; settings.destekUser = [{ channelId: 'ticket', userId: 'owner' }];
  await ticket.execute(interaction('transcript')); assert.match(replied.content, /permission/);
  reset(); currentMember = staff; settings.destekUser = [{ channelId: 'ticket', userId: 'owner' }];
  await ticket.execute(interaction('del', { message: { author: { id: 'other-bot' } } }));
  assert.match(replied.content, /ticket message/);
  reset(); currentMember = stranger; settings.destekUser = [{ channelId: 'ticket', userId: 'owner' }];
  await ticket.execute(interaction('close')); assert.match(replied.content, /permission/);

  reset();
  await ticket.execute(interaction('tic', { channelId: 'panel-channel', message: { id: 'stale-panel', author: { id: 'bot' } } }));
  assert.match(replied.content, /no longer valid/); assert.equal(modal, null);
  await ticket.execute(interaction('ticket-create:forged', { isButton: () => false, isModalSubmit: () => true }));
  assert.match(replied.content, /Form is invalid/); assert.equal(creates.length, 0);

  // Two forms for the same user may race: the database reservation allows one Discord channel only.
  reset();
  const nonce1 = await openForm();
  const nonce2 = await openForm();
  const submit = nonce => interaction(nonce, { isButton: () => false, isModalSubmit: () => true });
  const results = await Promise.allSettled([ticket.execute(submit(nonce1)), ticket.execute(submit(nonce2))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(creates.length, 1);
  assert.equal(settings.destekUser.length, 1);
  assert.equal(settings.destekUser[0].channelId, 'ticket');
  assert.deepEqual(sent[0].allowedMentions.parse, []);
  await ticket.execute(submit(nonce1)); assert.match(replied.content, /Form is invalid/); assert.equal(creates.length, 1);

  // A modal is bound to its originating user; another member cannot consume it.
  reset(); currentMember = member('another-owner');
  const bound = await openForm(); currentMember = stranger;
  await ticket.execute(submit(bound)); assert.match(replied.content, /Form is invalid/); assert.equal(creates.length, 0);

  // Creation rollback removes a failed channel's slot; a failed channel delete keeps metadata for staff recovery.
  reset(); currentMember = member('rollback-owner');
  const rollback = await openForm(); failure = 'send';
  await assert.rejects(ticket.execute(submit(rollback)), /Simulated/);
  assert.equal(deleted, 1); assert.equal(settings.destekUser.length, 0);
  reset(); currentMember = member('cleanup-owner');
  const cleanup = await openForm(); failure = 'cleanup';
  const logger = require('../xelos/Structures/Handlers/logger');
  const originalError = logger.error;
  let cleanupLogged = false;
  logger.error = () => { cleanupLogged = true; };
  try { await assert.rejects(ticket.execute(submit(cleanup)), /Simulated/); }
  finally { logger.error = originalError; }
  assert.equal(cleanupLogged, true);
  assert.equal(settings.destekUser.length, 1); assert.equal(settings.destekUser[0].channelId, 'ticket');

  // Owner can close their own ticket through a bound modal; replay is rejected and reopening remains staff-only.
  reset(); settings.destekUser = [{ channelId: 'ticket', userId: 'owner', ticketName: 'ticket-test', closed: false }];
  await ticket.execute(interaction('close'));
  assert.ok(modal.custom_id.startsWith('ticket-close:'));
  const closeForm = modal.custom_id;
  await ticket.execute(interaction(closeForm, { isButton: () => false, isModalSubmit: () => true }));
  assert.equal(settings.destekUser[0].closed, true);
  assert.match(replied.content, /Ticket closed/);
  await ticket.execute(interaction(closeForm, { isButton: () => false, isModalSubmit: () => true }));
  assert.match(replied.content, /invalid/);

  // Private transcripts must not target public channels or ordinary-role/member exceptions.
  reset();
  const everyone = { id: 'guild', permissions: new PermissionsBitField() };
  const support = { id: 'staff', permissions: new PermissionsBitField() };
  const regular = { id: 'regular', permissions: new PermissionsBitField() };
  let publicRole = 'guild';
  const logGuild = { id: 'guild', roles: { fetch: async () => new Map([['guild', everyone], ['staff', support], ['regular', regular]]) }, members: { fetch: async () => stranger } };
  const log = { type: ChannelType.GuildText, guild: logGuild, permissionsFor: role => new PermissionsBitField(role.id === publicRole || role.id === 'staff' ? [P.ViewChannel] : []), permissionOverwrites: { cache: new Map() } };
  await assert.rejects(S.privateLog(log, settings, 'bot'), /only be visible/);
  publicRole = 'regular'; await assert.rejects(S.privateLog(log, settings, 'bot'), /only be visible/);
  publicRole = null; await S.privateLog(log, settings, 'bot');
  log.permissionOverwrites.cache.set('stranger', { type: OverwriteType.Member, id: 'stranger', allow: new PermissionsBitField([P.ViewChannel]) });
  await assert.rejects(S.privateLog(log, settings, 'bot'), /outside support/);

  // Gateway cache misses or permission failures must not discard live ticket metadata.
  reset();
  settings.destekAutoClose = { enabled: true, duration: '1h' }; settings.destekUser = [{ channelId: 'ticket', userId: 'owner', closed: false }];
  Server.find = async () => [settings];
  const checker = require('../xelos/Structures/Tasks/ticketInactivityChecker').checkInactiveTickets;
  const errorGuild = { id: 'guild', channels: { cache: new Map(), fetch: async () => { throw Object.assign(new Error('Missing access'), { code: 50001 }); } } };
  await checker({ guilds: { cache: new Map([['guild', errorGuild]]) }, user: { id: 'bot' } });
  assert.equal(updates.some(entry => entry.update.$pull?.destekUser?.channelId === 'ticket'), false);
  assert.equal(ticket.transcriptLimit, 2000);

  // All three public commands declare a default permission and a runtime permission.
  for (const file of ['panel.js', 'panel-label.js', 'ticket-channel.js']) {
    const c = require(`../xelos/Commands/Ticket/${file}`);
    assert.equal(c.data.toJSON().default_member_permissions, String(P.ManageChannels));
    assert.equal(c.permissions, P.ManageChannels);
  }
  // Exercise the shared runtime router, including autocomplete, without relying on Discord's menu filtering.
  const { registerTickets } = await import(pathToFileURL(path.resolve(__dirname, '../src/tickets.js')));
  const client = new EventEmitter(); registerTickets(client);
  const route = client.listeners(Events.InteractionCreate)[0];
  let executions = 0;
  for (const name of ['ticketsystem', 'ticketpanel', 'panel-label']) client.commands.set(name, {
    permissions: P.ManageChannels, execute: async () => { executions++; }, autocomplete: async () => { executions++; },
  });
  reset();
  for (const commandName of client.commands.keys()) await route(interaction('', { commandName, isChatInputCommand: () => true }));
  assert.equal(executions, 0);
  await route(interaction('', { commandName: 'ticketsystem', isButton: () => false, isAutocomplete: () => true, respond: async p => { assert.deepEqual(p, []); } }));
  assert.equal(executions, 0);
  currentMember = manager;
  for (const commandName of client.commands.keys()) await route(interaction('', { commandName, isChatInputCommand: () => true }));
  assert.equal(executions, 3);
  console.log('PASS: global management permissions, fresh/revoked membership, setup owner/expiry, support-role validation and private overwrites.');
  console.log('PASS: outsider/owner/staff action boundaries, forged/stale/wrong-user/replayed forms, atomic duplicate creation and mention suppression.');
  console.log('PASS: private-log role/member exceptions, access-error metadata preservation, shared locks, request limits and bounded transcripts.');
  console.log('PASS: runtime command/autocomplete denial, authorized routing, creation rollback, owner close and closed-form replay rejection.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
