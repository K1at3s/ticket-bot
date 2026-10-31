const { AsyncLocalStorage } = require('node:async_hooks');
const translations = require('./translations.cjs');
const context = new AsyncLocalStorage();
function language(value) { return typeof value === 'string' && value.toLowerCase().split('-')[0] === 'tr' ? 'tr' : 'en'; }
function runWithLanguage(value, callback) { return context.run(language(value), callback); }
function t(source, values = {}, locale = context.getStore() || 'en') {
  const result = language(locale) === 'tr' ? translations[source] || source : source;
  return result.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
}
function translator(locale) { return (source, values) => t(source, values, language(locale)); }
// Translate command descriptions, keeping canonical English command/option names stable.
function localizeCommand(builder) {
  if (builder.description && translations[builder.description]) builder.setDescriptionLocalizations({ tr: translations[builder.description] });
  if (builder.choices?.length && builder.setChoices) builder.setChoices(...builder.choices.map(choice => ({ ...choice,
    ...(translations[choice.name] ? { name_localizations: { ...choice.name_localizations, tr: translations[choice.name] } } : {}),
  })));
  for (const option of builder.options || []) localizeCommand(option);
  return builder;
}
module.exports = { t, translator, language, runWithLanguage, localizeCommand };
