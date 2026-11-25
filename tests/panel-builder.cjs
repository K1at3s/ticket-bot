const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');
const localRequire = createRequire(path.resolve(__dirname, '../package.json'));
const moduleUrl = name => pathToFileURL(path.resolve(__dirname, `../src/${name}.js`));

async function main() {
  const { blockPayload, moveBlock, newBlock, publishBlocks } = await import(moduleUrl('panel-blocks'));
  const { resolveIdentity } = await import(moduleUrl('panel-webhook'));
  const image = newBlock('image', { image: 'https://example.com/first.png', color: '#5865F2' });
  const text = newBlock('text', { body: '# Ticket\nBir seçim yap.' });
  const embed = newBlock('embed', { title: 'İkinci embed', body: 'Açıklama', color: '#123456' });
  assert.equal(blockPayload(image).embeds[0].description, undefined);
  assert.equal(blockPayload(image).embeds[0].title, undefined);
  const spacedImage = blockPayload({ ...image, content: '{boşluk}\n{boşluk}' });
  assert.equal(spacedImage.content, '\u200B\n\u200B');
  assert.equal(spacedImage.embeds[0].description, undefined);
  assert.equal(blockPayload({ ...image, content: 'Üst mesaj' }).content, 'Üst mesaj');
  assert.equal(blockPayload({ ...image, content: '' }).content, null);
  assert.throws(() => blockPayload(newBlock('image', { image: 'file:///private' })), /HTTP/);
  assert.throws(() => blockPayload(newBlock('embed')), /title/);
  assert.throws(() => blockPayload(newBlock('embed', { title: 'X', color: 'red' })), /HEX color/);
  const moved = [image, text, embed];
  assert.equal(moveBlock(moved, 2, -1), 1);
  assert.deepEqual(moved.map(b => b.id), [image.id, embed.id, text.id]);
  assert.equal(moveBlock(moved, 0, -1), 0);

  const events = [];
  let stored;
  let messageNumber = 0;
  const hook = { id: 'hook', token: 'test', owner: { id: 'bot' }, name: 'Ticket Panel',
    send: async payload => { events.push(['send', payload]); return { id: `header-${++messageNumber}` }; },
    editMessage: async (id, payload) => { events.push(['edit', payload]); return { id }; },
    deleteMessage: async id => { events.push(['delete', id]); } };
  const channel = { id: 'channel', guild: { name: 'Sunucum', iconURL: () => 'https://example.com/icon.png' },
    fetchWebhooks: async () => ({ get: () => hook, find: () => hook }) };
  const panel = { blocks: [image, text, embed], webhookName: '{sunucuismi}', webhookAvatar: '{sunucuikonu}' };
  const persist = async state => { stored = structuredClone(state); };
  await publishBlocks(panel, channel, null, 'bot', persist, resolveIdentity);
  assert.equal(events.length, 3);
  assert.equal(events[0][1].embeds[0].image.url, image.image);
  assert.equal(events[1][1].content, text.body);
  assert.equal(events[2][1].embeds[0].title, embed.title);
  assert.ok(events.every(([, p]) => p.username === 'Sunucum' && p.avatarURL === 'https://example.com/icon.png'));
  assert.equal(stored.blockMessages.length, 3);
  assert.equal('token' in stored, false);
  events.length = 0;
  await publishBlocks(panel, channel, stored, 'bot', persist, resolveIdentity);
  assert.deepEqual(events.map(e => e[0]), ['edit', 'edit', 'edit']);
  events.length = 0;
  panel.blocks = [embed, image, text];
  await publishBlocks(panel, channel, stored, 'bot', persist, resolveIdentity);
  assert.deepEqual(events.map(e => e[0]), ['delete', 'delete', 'delete', 'send', 'send', 'send']);
  assert.equal(events[3][1].embeds[0].title, embed.title);

  const Server = localRequire('./bot/Structures/Schemas/Server.js');
  const settings = { guildId: 'guild', destekChannel: 'category', destekRole: ['staff'], destekkategoriListesi: [{ label: 'General', value: 'general' }] };
  Server.findOne = async () => settings;
  Server.updateOne = async (filter, update) => { Object.assign(settings, update.$set); };
  const { handleBuilder } = await import(moduleUrl('panel-builder'));
  const { handlePanel } = await import(moduleUrl('panel'));
  let ui, modal;
  const member = { id: 'owner', permissions: { has: () => true }, roles: { cache: new Map() } };
  const members = { fetch: async () => member, me: {} };
  const base = { locale: 'en-US', guild: { id: 'guild', members }, user: { id: 'owner' }, guildId: 'guild', inGuild: () => true, memberPermissions: { has: () => true },
    isChatInputCommand: () => false, isModalSubmit: () => false,
    reply: async p => { ui = p; }, editReply: async p => { ui = p; }, update: async p => { ui = p; },
    showModal: async p => { modal = p.toJSON(); }, deferReply: async () => {}, deferUpdate: async () => {} };
  const command = { ...base, commandName: 'ticketpanel', isChatInputCommand: () => true,
    options: { getChannel: () => ({ id: 'channel' }), getString: name => name === 'mode' ? 'manual' : 'select' } };
  assert.equal(await handlePanel(command), true);
  assert.match(ui.content, /No blocks yet/);
  const serialize = () => ui.components.map(c => c.toJSON());
  assert.ok(serialize().length <= 5);
  const id = serialize()[0].components[0].custom_id.split(':')[2];
  const click = async action => handleBuilder({ ...base, customId: `builder:${action}:${id}` });
  const submit = async data => handleBuilder({ ...base, customId: modal.custom_id, isModalSubmit: () => true, isFromMessage: () => true,
    fields: { fields: new Map(Object.entries(data).map(([k, v]) => [k, { value: v }])) } });
  await click('addimage'); await submit({ image: image.image, color: '#5865F2', content: '{boşluk}\n{boşluk}' });
  await click('addtext'); await submit({ body: 'Orta metin' });
  await click('addembed'); await submit({ title: 'Son embed', body: '', image: '', color: '#123456' });
  assert.match(ui.content, /3\/15 blocks/);
  assert.equal(serialize()[1].components[0].options.length, 3);
  await click('up');
  const labels = serialize()[1].components[0].options.map(o => o.label);
  assert.match(labels[1], /Son embed/);
  await click('edit');
  assert.equal(modal.components[0].components[0].value, 'Son embed');
  await submit({ title: 'Düzenlenmiş embed', body: '', image: '', color: '#ABCDEF' });
  assert.match(ui.content, /Düzenlenmiş embed/);
  await click('delete');
  assert.equal(serialize()[1].components[0].options.length, 2);
  await handleBuilder({ ...base, user: { id: 'other' }, customId: `builder:delete:${id}` });
  assert.match(ui.content, /does not belong to you/);
  // Recover editor view then publish; all headers must precede the bot message.
  await click('down');
  events.length = 0;
  Object.assign(channel, { type: 0, permissionsFor: () => ({ has: () => true }), send: async payload => {
    events.push(['bot', payload]); return { id: 'menu', url: 'https://discord.com/channels/guild/channel/menu' };
  } });
  await handleBuilder({ ...base, customId: `builder:publish:${id}`, client: { user: { id: 'bot' } },
    guild: { channels: { fetch: async () => channel }, members } });
  assert.deepEqual(events.map(e => e[0]), ['send', 'send', 'bot']);
  assert.equal(events[0][1].content, '\u200B\n\u200B');
  assert.equal(events[2][1].content, null);
  assert.equal(events[2][1].embeds.length, 0);
  assert.equal(settings.panel.blocks.length, 2);
  assert.match(ui.content, /published/);
  await handlePanel(command);
  assert.match(ui.content, /2\/15 blocks/);
  const ticketCommand = localRequire('./bot/Commands/Ticket/ticket-channel.js');
  const editOption = ticketCommand.data.toJSON().options.find(o => o.name === 'edit');
  assert.ok(editOption.description_localizations.tr);
  await ticketCommand.execute({ ...base, locale: 'en-US', guild: { id: 'guild', members }, commandName: 'ticketsystem',
    isChatInputCommand: () => true, member: { permissions: { has: () => true } },
    options: { getSubcommand: () => 'edit' } }, {});
  assert.match(ui.content, /2\/15 blocks/);
  assert.match(ui.content, /<#channel>/);
  const setup = localRequire('./bot/Structures/Handlers/panelSetup.js').panelSetup('owner', 'channel', 'select');
  assert.match(setup.components[0].toJSON().components[0].custom_id, /^builder:create:/);
  console.log('PASS: multiple independent embeds/text/images, validation, movement and ordered webhook publishing.');
  console.log('PASS: real setup/command routing, add/edit/delete/select, owner guard, component-only bot and saved-panel reload.');
  console.log('PASS: ticketsystem edit opens the persisted panel without channel/control arguments.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
