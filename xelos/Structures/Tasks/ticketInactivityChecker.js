const Server = require('../Schemas/Server');
const { closeTicket } = require('../../Events/Client/TicketSystem');
const { tryLock } = require('../Handlers/security');
const logger = require('../Handlers/logger');
const ms = require('ms');
let running = false;

async function checkInactiveTickets(client) {
  if (running) return;
  running = true;
  try {
    const settingsList = await Server.find({ 'destekAutoClose.enabled': true });
    for (const settings of settingsList) {
      const guild = client.guilds.cache.get(settings.guildId);
      if (!guild) continue;
      const duration = ms(settings.destekAutoClose.duration);
      if (!Number.isFinite(duration) || duration < 3600000) continue;
      for (const ticket of settings.destekUser.filter(item => item.channelId && !item.closed)) {
        const release = tryLock(`ticket:${guild.id}:${ticket.channelId}`);
        if (!release) continue;
        try {
          let channel;
          try { channel = await guild.channels.fetch(ticket.channelId); }
          catch (error) {
            // An incomplete gateway cache or a permission error must never discard a live ticket record.
            if (error.code === 10003) await Server.updateOne({ guildId: guild.id }, { $pull: { destekUser: { channelId: ticket.channelId } } });
            continue;
          }
          if (!channel?.isTextBased()) continue;
          const currentSettings = await Server.findOne({ guildId: guild.id });
          const current = currentSettings?.destekUser.find(item => item.channelId === channel.id);
          if (!current || current.closed || !currentSettings.destekAutoClose.enabled) continue;
          const messages = await channel.messages.fetch({ limit: 1 });
          const lastActivity = messages.first()?.createdTimestamp || channel.createdTimestamp;
          if (Date.now() - lastActivity > duration) await closeTicket(channel, currentSettings, current, 'Automatically closed due to inactivity.', client.user.id);
        } catch (error) { logger.error('Automatic ticket closure failed', error); }
        finally { release(); }
      }
      // Recover abandoned reservations only after 15 minutes; live channel records are never removed here.
      await Server.updateOne({ guildId: guild.id }, { $pull: { destekUser: { channelId: { $exists: false }, reservationId: { $exists: true }, createdAt: { $lt: new Date(Date.now() - 900000) } } } });
    }
  } catch (error) { logger.error('Ticket inactivity check failed', error); }
  finally { running = false; }
}
function initialize(client) {
  setTimeout(() => checkInactiveTickets(client), 60000).unref();
  setInterval(() => checkInactiveTickets(client), 3600000).unref();
}
module.exports = initialize;
module.exports.checkInactiveTickets = checkInactiveTickets;
