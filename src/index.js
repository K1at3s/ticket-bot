import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { connectDatabase, mongoClient } from './database.js';
import { registerTickets } from './tickets.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions: { parse: [], repliedUser: false } });
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
  console.log(`Bot ready: ${readyClient.user.tag}`);
});

client.on(Events.Error, () => {
  console.error('A Discord connection error occurred.');
});

process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

try {
  await connectDatabase();
  if (!stopping) await client.login(config.token);
} catch {
  console.error('Unable to start the bot. Check the token, MongoDB URI and connection.');
  await shutdown(1);
}
