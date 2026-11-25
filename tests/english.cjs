const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const turkish = /[çğıöşüÇĞİÖŞÜ]/;

async function main() {
  for (const file of ['ticket-channel', 'panel', 'panel-label']) {
    const data = require(`../src/bot/Commands/Ticket/${file}.js`).data.toJSON();
    assert.equal(turkish.test(data.description), false);
    assert.ok(data.description_localizations.tr);
  }
  const setup = require('../src/bot/Structures/Handlers/panelSetup').panelSetup('owner', 'channel', 'select');
  assert.equal(setup.components[0].toJSON().components[0].label, 'Open panel builder');
  const { buildPanel } = require('../src/panel-renderer.cjs');
  assert.equal(buildPanel({ appearance: 'none', control: 'button' }).components[0].toJSON().components[0].label, 'Open a ticket');
  const { resolveIdentity, validateWebhook } = await import(pathToFileURL(path.resolve(__dirname, '../src/panel-webhook.js')));
  const guild = { name: 'My server', iconURL: () => 'https://example.com/icon.png' };
  const identity = resolveIdentity({ webhookName: '{servername}', webhookAvatar: '{servericon}' }, guild);
  assert.equal(identity.webhookName, guild.name);
  assert.equal(identity.webhookAvatar, guild.iconURL());
  validateWebhook({ webhookAvatar: '{servericon}' });
  // Saved legacy aliases still work without exposing them in the English UI.
  assert.equal(resolveIdentity({ webhookName: '{sunucuadı}' }, guild).webhookName, guild.name);
  const { blockPayload } = await import(pathToFileURL(path.resolve(__dirname, '../src/panel-blocks.js')));
  assert.equal(blockPayload({ type: 'image', image: 'https://example.com/image.png', content: '{space}\n{space}' }).content, '\u200B\n\u200B');
  console.log('PASS: canonical English commands with Turkish descriptions, English defaults, placeholders and saved-alias compatibility.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
