import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { connectDatabase, mongoClient } from './database.js';
import { registerTickets } from './tickets.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
registerTickets(client);
let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  client.destroy();
  await mongoClient.close();
  process.exitCode = exitCode;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot hazır: ${readyClient.user.tag}`);
});

client.on(Events.Error, () => {
  console.error('Discord bağlantısında hata oluştu.');
});

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

try {
  await connectDatabase();
  if (!stopping) await client.login(config.token);
} catch {
  console.error('Bot başlatılamadı. Token, MongoDB adresi ve bağlantıyı kontrol et.');
  await shutdown(1);
}
