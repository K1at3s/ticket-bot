import i18n from './i18n.cjs';
const { t } = i18n;
import { randomBytes } from 'node:crypto';

export const maxBlocks = 15;
export function newBlock(type, data = {}) { return { id: randomBytes(6).toString('hex'), type, ...data }; }
export function blockPayload(block) {
  if (block.type === 'text') {
    if (!block.body?.trim() || block.body.length > 2000) throw new Error('Text must contain 1–2000 characters.');
    return { content: block.body, embeds: [] };
  }
  if (!['embed', 'image'].includes(block.type)) throw new Error(t('Invalid block type.'));
  if (block.type === 'image' && !block.image) throw new Error(t('An image URL is required.'));
  if (block.type === 'embed' && !block.title && !block.body && !block.image) throw new Error(t('Provide an embed title, description or image.'));
  if ((block.title?.length || 0) > 256 || (block.body?.length || 0) > 4000) throw new Error(t('Embed text is too long.'));
  const embed = {};
  if (block.type === 'embed' && block.title) embed.title = block.title;
  if (block.type === 'embed' && block.body) embed.description = block.body;
  if (block.image) {
    let url;
    try { url = new URL(block.image); } catch { throw new Error(t('Enter a valid image URL.')); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error(t('The image URL must use HTTP or HTTPS.'));
    embed.image = { url: block.image };
  }
  if (block.color) {
    if (!/^#?[0-9a-f]{6}$/i.test(block.color)) throw new Error(t('Enter a HEX color, such as #5865F2.'));
    embed.color = parseInt(block.color.replace('#', ''), 16);
  }
  if (block.content !== undefined && (typeof block.content !== 'string' || block.content.length > 2000)) throw new Error(t('The message above the embed cannot exceed 2000 characters.'));
  const content = block.content?.replace(/\{space\}|\{boşluk\}|\{bosluk\}/g, '\u200B');
  if (content?.length > 2000) throw new Error(t('The message above the embed cannot exceed 2000 characters.'));
  return { content: content || null, embeds: [embed] };
}

export function moveBlock(blocks, index, direction) {
  const next = index + direction;
  if (index < 0 || next < 0 || next >= blocks.length) return index;
  [blocks[index], blocks[next]] = [blocks[next], blocks[index]];
  return next;
}

export async function publishBlocks(panel, channel, saved, botId, persist, resolveIdentity) {
  if (panel.blocks.length > maxBlocks) throw new Error(t('You can add up to 15 blocks.'));
  const payloads = panel.blocks.map(blockPayload);
  if (!payloads.length && !saved) return { added: false };
  const identity = resolveIdentity(panel, channel.guild);
  if (!identity.webhookName.trim()) throw new Error(t('The webhook name cannot be empty.'));
  const hooks = await channel.fetchWebhooks();
  let hook = saved?.channelId === channel.id ? hooks.get(saved.webhookId) : null;
  if (!hook?.token || hook.owner?.id !== botId) hook = hooks.find(h => h.owner?.id === botId && h.name === 'Ticket Panel' && h.token);
  if (!hook && !payloads.length) return { added: false };
  if (!hook) hook = await channel.createWebhook({ name: 'Ticket Panel', reason: 'Ticket panel builder' });
  const same = saved?.channelId === channel.id && saved.webhookId === hook.id;
  const signature = JSON.stringify([panel.blocks.map(b => b.id), identity.webhookName, identity.webhookAvatar]);
  const state = { channelId: channel.id, webhookId: hook.id, signature, blockMessages: same ? [...(saved.blockMessages || [])] : [] };
  const previousIds = same ? [...state.blockMessages.map(m => m.messageId), saved.textId, saved.imageId].filter(Boolean) : [];
  if (same && saved.signature !== signature) {
    for (const id of previousIds) await hook.deleteMessage(id).catch(error => { if (error.code !== 10008) throw error; });
    state.blockMessages = [];
  }
  await persist(structuredClone(state));
  let added = false;
  for (let index = 0; index < panel.blocks.length; index++) {
    const block = panel.blocks[index];
    const existing = state.blockMessages.find(m => m.blockId === block.id);
    const payload = { ...payloads[index], allowedMentions: { parse: [] } };
    let message;
    if (existing) {
      try { message = await hook.editMessage(existing.messageId, payload); }
      catch (error) { if (error.code !== 10008) throw error; }
      // Recreate the tail if a tracked message is missing, preserving order.
      if (!message) {
        for (const entry of state.blockMessages.slice(index + 1)) await hook.deleteMessage(entry.messageId).catch(e => { if (e.code !== 10008) throw e; });
        state.blockMessages = state.blockMessages.slice(0, index);
      }
    }
    if (!message) {
      message = await hook.send({ ...payload, username: identity.webhookName, ...(identity.webhookAvatar ? { avatarURL: identity.webhookAvatar } : {}) });
      state.blockMessages.push({ blockId: block.id, messageId: message.id });
      added = true;
      await persist(structuredClone(state));
    }
  }
  return { added, state };
}
