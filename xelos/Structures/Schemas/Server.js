const { Schema, model } = require('mongoose');
const schema = new Schema({
  guildId: { type: String, required: true, unique: true },
  setupDraft: { type: Schema.Types.Mixed, default: null },
  destekChannel: String,
  setupOwner: String,
  setupExpires: Date,
  destekMesajKanal: String,
  panel: { type: Schema.Types.Mixed, default: null },
  panelChannelId: String,
  panelMessageId: String,
  panelWebhook: { type: Schema.Types.Mixed, default: null },
  destekLogChannel: { type: String, default: null },
  destekAutoClose: { enabled: { type: Boolean, default: false }, duration: { type: String, default: '48h' } },
  destekRole: { type: [String], default: [] },
  destekCount: { type: Number, default: 0 },
  destekkategoriListesi: { type: Array, default: [] },
  destekUser: [{ channelId: String, userId: String, ticketName: String, reservationId: String, createdAt: Date, subject: String, description: String, category: String, locale: String,
    claimedBy: { type: String, default: null }, closed: { type: Boolean, default: false } }],
  destekAutoResponses: [{ keyword: { type: String, required: true }, response: { type: String, required: true } }],
});
module.exports = model('TicketServer', schema);
