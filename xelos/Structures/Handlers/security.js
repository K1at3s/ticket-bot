const { PermissionsBitField: { Flags: P }, OverwriteType, ChannelType } = require('discord.js');
const actors = new WeakMap();
const locks = new Set();
const rates = new Map();

async function actor(interaction) {
  if (!actors.has(interaction)) actors.set(interaction, (async () => {
    if (!interaction.inGuild() || !interaction.guild?.members?.fetch) return null;
    try { return await interaction.guild.members.fetch({ user: interaction.user.id, force: true }); }
    catch { return null; }
  })());
  return actors.get(interaction);
}
async function isManager(interaction) { return Boolean((await actor(interaction))?.permissions.has(P.ManageChannels)); }
function isStaff(member, settings) {
  return Boolean(member?.permissions.has(P.ManageChannels) || member?.roles.cache.some(r => r.id !== settings.guildId && settings.destekRole?.includes(r.id)));
}
function tryLock(key) {
  if (locks.has(key)) return null;
  locks.add(key);
  return () => locks.delete(key);
}
function rateLimit(key, limit, duration, now = Date.now()) {
  if (rates.size > 1000) for (const [k, entry] of rates) if (entry.expires <= now) rates.delete(k);
  let entry = rates.get(key);
  if (!entry || entry.expires <= now) {
    if (rates.size >= 10000 && !entry) return false;
    entry = { count: 0, expires: now + duration }; rates.set(key, entry);
  }
  return ++entry.count <= limit;
}
async function supportRoles(guild, ids) {
  const unique = [...new Set(ids || [])];
  if (!unique.length || unique.length > 5 || unique.includes(guild.id)) throw new Error('Select 1–5 support roles. @everyone cannot be a support role.');
  for (const id of unique) {
    const role = await guild.roles.fetch(id);
    if (!role || role.managed) throw new Error('Support roles must exist and be manually assignable.');
  }
  return unique;
}
function ticketOverwrites(guildId, botId, ownerId, roles) {
  if (!roles.length || roles.includes(guildId)) throw new Error('@everyone cannot receive ticket access.');
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles];
  return [
    { id: guildId, type: OverwriteType.Role, deny: [P.ViewChannel] },
    ...[...new Set(roles)].map(id => ({ id, type: OverwriteType.Role, allow })),
    { id: botId, type: OverwriteType.Member, allow: [...allow, P.EmbedLinks, P.ManageChannels, P.ManageRoles] },
    { id: ownerId, type: OverwriteType.Member, allow },
  ];
}
async function privateLog(channel, settings, botId) {
  if (!channel || channel.type !== ChannelType.GuildText || channel.guild.id !== settings.guildId) throw new Error('Select a valid private log channel.');
  const roles = await channel.guild.roles.fetch();
  for (const role of roles.values()) {
    if (role.id !== settings.guildId && (role.permissions.has(P.Administrator) || role.permissions.has(P.ManageChannels) || settings.destekRole?.includes(role.id))) continue;
    if (channel.permissionsFor(role)?.has(P.ViewChannel)) throw new Error('The log channel must only be visible to support staff and managers.');
  }
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.type !== OverwriteType.Member || overwrite.id === botId || !overwrite.allow.has(P.ViewChannel)) continue;
    const member = await channel.guild.members.fetch({ user: overwrite.id, force: true });
    if (!isStaff(member, settings)) throw new Error('The log channel grants an individual member outside support access.');
  }
}
function canRead(channel, member) { return Boolean(member && channel?.permissionsFor(member)?.has([P.ViewChannel, P.ReadMessageHistory])); }
function canPost(channel, member) { return Boolean(member && channel?.permissionsFor(member)?.has([P.ViewChannel, P.SendMessages])); }
async function activeSetup(interaction) {
  const settings = await require('../Schemas/Server').findOne({ guildId: interaction.guildId });
  return Boolean(settings?.setupOwner === interaction.user.id && settings.setupExpires > new Date());
}

module.exports = { actor, isManager, isStaff, tryLock, rateLimit, supportRoles, ticketOverwrites, privateLog, canRead, canPost, activeSetup };
