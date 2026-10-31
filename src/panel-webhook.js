import i18n from './i18n.cjs';
const { t } = i18n;
export function webhookEnabled(panel) {
  return panel.appearance !== 'none' || Boolean(panel.webhookText || panel.webhookImage);
}

export function resolveIdentity(panel, guild) {
  const icon = guild?.iconURL?.({ size: 512 }) || '';
  const tokens = { '{servername}': guild?.name || 'Tickets', '{servericon}': icon, '{serveravatar}': icon,
    '{sunucuadı}': guild?.name || 'Tickets', '{sunucuismi}': guild?.name || 'Tickets',
    '{sunucuadi}': guild?.name || 'Tickets', '{sunucuikonu}': icon, '{sunucuavatarı}': icon };
  const replace = value => String(value || '').replace(/\{[^{}]+\}/g, token => tokens[token] ?? token);
  return { ...panel, webhookName: replace(panel.webhookName || '{servername}').slice(0, 80), webhookAvatar: replace(panel.webhookAvatar) };
}

export function webhookMessages(panel) {
  const text = panel.appearance === 'text' ? panel.body : panel.webhookText;
  let embed;
  if (panel.appearance === 'embed') {
    embed = {};
    if (panel.title) embed.title = panel.title;
    if (panel.body) embed.description = panel.body;
    if (panel.image) embed.image = { url: panel.image };
    if (panel.color) embed.color = parseInt(panel.color.replace('#', ''), 16);
  } else if (panel.webhookImage) {
    embed = { image: { url: panel.webhookImage } };
    if (panel.color) embed.color = parseInt(panel.color.replace('#', ''), 16);
  }
  return [
    ['textId', text, { content: text || null, embeds: [] }],
    ['imageId', embed, { content: null, embeds: embed ? [embed] : [] }],
  ];
}

export function validateWebhook(panel) {
  for (const key of ['webhookImage', 'webhookAvatar']) {
    if (!panel[key]) continue;
    if (key === 'webhookAvatar' && ['{servericon}', '{serveravatar}', '{sunucuikonu}', '{sunucuavatarı}'].includes(panel[key])) continue;
    let url;
    try { url = new URL(panel[key]); } catch { throw new Error(t('Enter a valid webhook image URL.')); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('Webhook images must use HTTP or HTTPS URLs.'));
  }
}

// Only use webhooks owned by this bot. Tokens are never stored in MongoDB.
export async function publishWebhook(panel, channel, saved, botId, persist) {
  if (!webhookEnabled(panel)) return { added: false };
  panel = resolveIdentity(panel, channel.guild);
  validateWebhook(panel);
  const hooks = await channel.fetchWebhooks();
  let hook = saved?.channelId === channel.id ? hooks.get(saved.webhookId) : null;
  if (!hook?.token || hook.owner?.id !== botId) {
    hook = hooks.find(h => h.owner?.id === botId && h.name === 'Ticket Panel' && h.token);
  }
  if (!hook) hook = await channel.createWebhook({ name: 'Ticket Panel', reason: 'Ticket panel header messages' });
  const same = saved?.channelId === channel.id && saved.webhookId === hook.id;
  const state = { channelId: channel.id, webhookId: hook.id, imageId: same ? saved.imageId : null, textId: same ? saved.textId : null };
  const signature = JSON.stringify([webhookMessages(panel).map(([, enabled]) => Boolean(enabled)), panel.webhookName, panel.webhookAvatar, 2]);
  if (same && saved.signature !== signature) {
    for (const key of ['textId', 'imageId']) {
      if (state[key]) await hook.deleteMessage(state[key]).catch(error => { if (error.code !== 10008) throw error; });
      state[key] = null;
    }
  }
  state.signature = signature;
  await persist({ ...state });
  let added = false;
  // Optional text first, optional embed second; the bot component is always last.
  for (const [key, enabled, payload] of webhookMessages(panel)) {
    if (!enabled) {
      if (state[key]) {
        await hook.deleteMessage(state[key]).catch(error => { if (error.code !== 10008) throw error; });
        state[key] = null;
        await persist({ ...state });
      }
      continue;
    }
    let message;
    if (state[key]) {
      try { message = await hook.editMessage(state[key], { ...payload, allowedMentions: { parse: [] } }); }
      catch (error) { if (error.code !== 10008) throw error; }
    }
    if (!message) {
      message = await hook.send({ ...payload, username: panel.webhookName || 'Tickets',
        ...(panel.webhookAvatar ? { avatarURL: panel.webhookAvatar } : {}), allowedMentions: { parse: [] } });
      added = true;
      state[key] = message.id;
      await persist({ ...state });
    }
  }
  return { added, state };
}
