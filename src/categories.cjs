const { t } = require('./i18n.cjs');
const { createHash } = require('node:crypto');
const emojiPattern = /^(?:<a?:\w{1,32}:\d{17,20}>|[^\p{L}\p{N}]*[\p{Extended_Pictographic}\p{Regional_Indicator}][^\p{L}\p{N}]*|[0-9#*]\uFE0F?\u20E3)$/u;
function parseEmoji(raw) {
  if (!raw) return undefined;
  if (!emojiPattern.test(raw) || raw.length > 100) throw new Error(t('Enter a valid emoji.'));
  const match = raw.match(/^<(a?):(\w+):(\d+)>$/);
  if (!match && [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(raw)].length !== 1) throw new Error(t('Enter a valid emoji.'));
  return match ? { id: match[3], name: match[2], animated: Boolean(match[1]) } : { name: raw };
}
function parseCategories(raw) {
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length || lines.length > 25) throw new Error(t('Enter 1-25 distinct categories.'));
  const categories = lines.map((line, index) => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length > 3 || !parts[0]) throw new Error(t('Enter 1-25 distinct categories.'));
    let [label, description = '', emoji = ''] = parts;
    if (parts.length === 2 && emojiPattern.test(description)) { emoji = description; description = ''; }
    if (label.length > 100 || description.length > 100) throw new Error(t('Category names and descriptions cannot exceed 100 characters.'));
    return { label, value: `category-${createHash('sha256').update(label).digest('hex').slice(0, 24)}`, ...(description ? { description } : {}), ...(emoji ? { emoji: parseEmoji(emoji) } : {}) };
  });
  if (new Set(categories.map(c => c.label.toLocaleLowerCase('en'))).size !== categories.length) throw new Error(t('Enter 1-25 distinct categories.'));
  return categories;
}
function formatCategories(categories) {
  return categories.map(c => [c.label, c.description || '', c.emoji?.id ? `<${c.emoji.animated ? 'a' : ''}:${c.emoji.name}:${c.emoji.id}>` : c.emoji?.name || ''].join('|')).join('\n');
}
module.exports = { parseCategories, parseEmoji, formatCategories };
