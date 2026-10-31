const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ChannelType, PermissionsBitField, Collection } = require('discord.js');
const Server = require('../xelos/Structures/Schemas/Server');
const { t, runWithLanguage } = require('../src/i18n.cjs');
const { parseCategories, parseEmoji } = require('../src/categories.cjs');
const { buildPanel } = require('../src/panel-renderer.cjs');
const P = PermissionsBitField.Flags;
const importSource = file => import(pathToFileURL(path.resolve(__dirname, '../src', file)));
let discordLocale = 'en-US';
let settings, ui, modal, member, writes, publicPosts;
const manager = { id: 'manager', permissions: new PermissionsBitField([P.ManageChannels]), roles: { cache: new Collection() } };
const guild = { id: 'guild', name: 'Test server', iconURL: () => null,
  members: { fetch: async () => member, me: {} }, roles: { fetch: async id => ({ id, managed: false }) },
  channels: { fetch: async id => ({ id, type: id === 'parent' ? ChannelType.GuildCategory : ChannelType.GuildText,
    permissionsFor: () => new PermissionsBitField(Object.values(P)), send: async () => { publicPosts++; throw new Error('Setup must not post publicly'); } }),
    create: async () => { throw new Error('Setup must not create channels'); } },
};
function reset() { settings = null; ui = modal = null; member = manager; writes = 0; publicPosts = 0; }
Server.findOne = async () => settings ? structuredClone(settings) : null;
Server.findOneAndUpdate = async (query, update) => { settings ||= { guildId: 'guild' }; Object.assign(settings, structuredClone(update.$set)); writes++; return structuredClone(settings); };
Server.updateOne = async (query, update) => {
  if (query['setupDraft.id'] && query['setupDraft.id'] !== settings?.setupDraft?.id) return { matchedCount: 0 };
  if (query.setupOwner && query.setupOwner !== settings?.setupOwner) return { matchedCount: 0 };
  if (query['setupDraft.step'] && query['setupDraft.step'] !== settings?.setupDraft?.step) return { matchedCount: 0 };
  Object.assign(settings, structuredClone(update.$set || {}));
  for (const key of Object.keys(update.$unset || {})) delete settings[key];
  writes++; return { matchedCount: 1, modifiedCount: 1 };
};
function interaction(customId, options = {}) {
  const i = { guild, guildId: guild.id, user: { id: member.id }, locale: discordLocale, customId, client: { user: { id: 'bot' } },
    inGuild: () => true, isChatInputCommand: () => false, isModalSubmit: () => false, isFromMessage: () => true,
    reply: async p => { i.replied = true; ui = p; }, followUp: async p => { ui = p; },
    editReply: async p => { ui = p; }, update: async p => { ui = p; },
    deferReply: async () => { i.deferred = true; }, deferUpdate: async () => { i.deferred = true; },
    showModal: async p => { modal = p.toJSON(); }, ...options };
  return i;
}
const components = () => ui.components.map(c => c.toJSON());
function validateUI(payload) {
  assert.ok(payload.components.length <= 5);
  for (const row of payload.components) {
    const data = row.toJSON(); assert.ok(data.components.length <= 5);
    for (const c of data.components) {
      assert.ok((c.custom_id?.length || 0) <= 100);
      if (c.label) assert.ok(c.label.length <= 80);
      if (c.options) assert.ok(c.options.length <= 25);
    }
  }
}
async function main() {
  const { startSetup, handleSetup } = await importSource('setup.js');
  const { handleBuilder } = await importSource('panel-builder.js');
  const { templatePanel } = await importSource('panel-templates.js');
  for (const language of ['en', 'tr']) for (const control of ['button', 'select']) for (const mode of ['automatic', 'manual']) {
    reset(); discordLocale = language;
    await startSetup(interaction()); assert.equal(settings.setupDraft.step, 'category');
    // Discord's interaction locale selects the interface without a language setting.
    const id = settings.setupDraft.id;
    const choose = async (action, values) => { assert.equal(await handleSetup(interaction(`setup:${id}:${action}`, { values })), true); if (ui.components) validateUI(ui); };
    assert.equal(settings.setupDraft.step, 'category');
    assert.equal(ui.embeds[0].toJSON().title, language === 'tr' ? 'Destek kategorisi' : 'Ticket category');
    await choose('category', ['parent']); await choose('channel', ['panel']); await choose('roles', ['staff']);
    await choose(control); await choose(mode);
    if (control === 'select') {
      if (mode === 'manual') {
        await choose('custom'); assert.ok(modal.custom_id.endsWith(':categoriesform'));
        await handleSetup(interaction(modal.custom_id, { isModalSubmit: () => true, fields: { getTextInputValue: () => 'My category|🎫\nOther|Optional details|🚩' } }));
        assert.equal(settings.setupDraft.categories[0].description, undefined);
      } else await choose('defaults');
    }
    assert.equal(settings.setupDraft.step, 'review');
    await choose('finish');
    assert.equal(settings.language, undefined); assert.equal(settings.destekChannel, 'parent'); assert.equal(settings.destekMesajKanal, 'panel');
    assert.deepEqual(settings.destekRole, ['staff']); assert.equal(settings.setupOwner, undefined);
    assert.equal(publicPosts, 0); assert.equal(settings.panelMessageId, undefined);
    assert.match(ui.content, mode === 'automatic' ? /2\/15/ : /0\/15/);
    assert.equal(components().at(-1).components[0].disabled, true);
    const draftId = components()[0].components[0].custom_id.split(':')[2];
    if (mode === 'automatic') {
      const panel = templatePanel(control, language); assert.equal(panel.blocks.length, 2);
      assert.ok(panel.blocks.every(b => b.body.includes('> ')));
      assert.equal(panel.blocks[0].title, language === 'tr' ? '🎫 Destek merkezi' : '🎫 Support center');
      await handleBuilder(interaction(`builder:edit:${draftId}`));
      assert.equal(modal.components[0].components[0].value, panel.blocks[0].title);
      await handleBuilder(interaction(`builder:form:${draftId}:${modal.custom_id.split(':')[3]}:embed`, {
        isModalSubmit: () => true, fields: { fields: new Map([['title', { value: 'Custom title' }], ['color', { value: '#123456' }]]) } }));
      assert.match(ui.content, /Custom title/);
    }
  }
  // Owner, nonce, step, expiry and current management permission are all checked.
  reset(); discordLocale = 'en-US'; await startSetup(interaction()); const id = settings.setupDraft.id;
  let before = writes;
  await handleSetup(interaction(`setup:${id}:finish`)); assert.match(ui.content, /no longer active/); assert.equal(writes, before);
  await handleSetup(interaction('setup:forged:en')); assert.match(ui.content, /expired/); assert.equal(writes, before);
  member = { ...manager, id: 'other' };
  await handleSetup(interaction(`setup:${id}:category`)); assert.match(ui.content, /another user/); assert.equal(writes, before);
  member = { ...manager, permissions: new PermissionsBitField() };
  await handleSetup(interaction(`setup:${id}:category`)); assert.match(ui.content, /lack permission/); assert.equal(writes, before);
  member = manager; settings.setupExpires = new Date(Date.now() - 1000);
  await handleSetup(interaction(`setup:${id}:category`)); assert.match(ui.content, /expired/); assert.equal(writes, before);
  reset(); discordLocale = 'tr'; await startSetup(interaction()); const backId = settings.setupDraft.id;
  await handleSetup(interaction(`setup:${backId}:category`, { values: ['parent'] })); await handleSetup(interaction(`setup:${backId}:back`));
  assert.equal(settings.setupDraft.step, 'category'); assert.equal(settings.setupDraft.language, 'tr');
  await handleSetup(interaction(`setup:${backId}:cancel`)); assert.equal(settings.setupDraft, undefined); assert.match(ui.content, /iptal/);
  // New standalone panel drafts ask both questions; choosing manual does not seed embeds.
  discordLocale = 'en-US';
  settings = { guildId: 'guild', language: 'tr', destekChannel: 'parent', destekRole: ['staff'], destekkategoriListesi: [] };
  await handleBuilder(interaction('', { commandName: 'ticketpanel', isChatInputCommand: () => true,
    options: { getChannel: () => ({ id: 'panel' }), getString: () => null } }));
  assert.match(ui.content, /Choose a control/);
  const builderId = components()[0].components[0].custom_id.split(':')[2];
  await handleBuilder(interaction(`builder:chooseselect:${builderId}`));
  await handleBuilder(interaction(`builder:choosemanual:${builderId}`));
  await handleBuilder(interaction(`builder:continue:${builderId}`)); assert.match(ui.content, /0\/15 blocks/);
  assert.equal(components().at(-1).components[0].options.length, 3);
  await handleBuilder(interaction(`builder:design:${builderId}`));
  await handleBuilder(interaction(`builder:chooseauto:${builderId}`));
  await handleBuilder(interaction(`builder:continue:${builderId}`)); assert.match(ui.content, /2\/15 blocks/);
  // Categories and emoji accept short/custom forms without forcing descriptions.
  assert.equal(parseCategories('Name|🎫')[0].description, undefined);
  assert.equal(parseCategories('Name')[0].label, 'Name');
  assert.equal(parseCategories('Name||<a:ticket:123456789012345678>')[0].emoji.animated, true);
  assert.throws(() => parseCategories('Same\nsame'), /distinct/);
  assert.throws(() => parseCategories('Name||not-an-emoji'), /valid emoji/);
  assert.throws(() => parseCategories(Array(26).fill('Name').join('\n')), /1-25/);
  assert.equal(parseEmoji('🎫').name, '🎫');
  const trPanel = buildPanel({ appearance: 'none', control: 'button', language: 'tr', buttonEmoji: '🎫' });
  assert.equal(trPanel.components[0].toJSON().components[0].label, 'Talep aç');
  assert.equal(trPanel.content, null); assert.deepEqual(trPanel.embeds, []);
  // Concurrent servers keep independent languages, regardless of Discord locale.
  const result = await Promise.all(['en', 'tr'].map(language => runWithLanguage(language, async () => { await Promise.resolve(); return t('Subject'); })));
  assert.deepEqual(result, ['Subject', 'Konu']); assert.equal(t('Subject'), 'Subject');
  assert.equal(require('../src/i18n.cjs').translator('de')('Subject'), 'Subject');
  const config = require('../xelos/Commands/Ticket/ticket-channel').data.toJSON().options.find(option => option.name === 'config');
  assert.equal(config.options.some(option => option.name === 'language'), false);
  // History continues to find logs created before or after changing languages.
  const command = require('../xelos/Commands/Ticket/ticket-channel');
  const fetchChannel = guild.channels.fetch;
  guild.channels.fetch = async id => id === 'log' ? { permissionsFor: () => new PermissionsBitField(Object.values(P)), messages: { fetch: async () => new Map([
    ['en', { author: { id: 'bot' }, url: 'https://discord.com/channels/guild/log/en', embeds: [{ title: 'Ticket Closed', fields: [{ name: 'Opened By', value: '<@target>' }, { name: 'Ticket ID', value: 'ticket-en' }], timestamp: new Date().toISOString() }] }],
    ['tr', { author: { id: 'bot' }, url: 'https://discord.com/channels/guild/log/tr', embeds: [{ title: 'Talep kapatıldı', fields: [{ name: 'Açan kullanıcı', value: '<@target>' }, { name: 'Talep numarası', value: 'ticket-tr' }], timestamp: new Date().toISOString() }] }],
  ]) } } : fetchChannel(id);
  for (const language of ['en', 'tr']) {
    discordLocale = language; settings.language = language === 'tr' ? 'en' : 'tr'; settings.destekLogChannel = 'log';
    await command.execute(interaction('', { options: { getSubcommand: () => 'search', getUser: () => ({ id: 'target', username: 'Target', tag: 'Target', displayAvatarURL: () => 'https://example.com/avatar.png' }) },
      editReply: async payload => { ui = payload; return { createMessageComponentCollector: () => ({ on: () => {} }) }; } }), {});
    assert.match(ui.embeds[0].toJSON().description, /ticket-en/); assert.match(ui.embeds[0].toJSON().description, /ticket-tr/);
  }
  guild.channels.fetch = fetchChannel;
  console.log('PASS: eight EN/TR × button/dropdown × automatic/manual setup paths, editable templates and no public posts before publishing.');
  console.log('PASS: setup nonce/owner/expiry/step/revoked-permission guards, back/cancel, standalone choices, category emoji and isolated Discord interaction locales.');
  console.log('PASS: history search preserves English and Turkish logs after Discord locale changes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
