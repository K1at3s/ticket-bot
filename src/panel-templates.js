import { blockQuote } from 'discord.js';
import { createRequire } from 'node:module';
import { newBlock } from './panel-blocks.js';
const require = createRequire(import.meta.url);
const { translator } = require('./i18n.cjs');

export function defaultCategories(language = 'en') {
  const t = translator(language);
  return [ ['General Support', 'general', '🎫'], ['Report', 'report', '🚩'], ['Billing', 'billing', '💳'] ]
    .map(([name, value, emoji]) => ({ label: t(name), value, emoji: { name: emoji } }));
}
export function templatePanel(control, language = 'en') {
  const t = translator(language);
  return { appearance: 'none', control, language, buttonEmoji: '🎫', webhookName: '{servername}', webhookAvatar: '{servericon}', label: '', blocks: [
    newBlock('embed', { title: `🎫 ${t('Support center')}`, body: `### ${t('Need a hand?')}\n${blockQuote(t('Open a private ticket to contact our support team.'))}`, color: '#5865F2' }),
    newBlock('embed', { title: `🧭 ${t('How it works')}`, body: `${blockQuote(t(control === 'select' ? 'Choose a category, describe your issue and our team will help you.' : 'Press the button, describe your issue and our team will help you.'))}\n\n🔐 ${t('Please include relevant details and avoid sharing passwords or sensitive information.')}`, color: '#57F287' }),
  ] };
}
