const required = ['DISCORD_TOKEN', 'MONGODB_URI'];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    throw new Error(`${key} eksik. .env dosyasını kontrol et.`);
  }
}

export const config = {
  token: process.env.DISCORD_TOKEN.trim(),
  mongoUri: process.env.MONGODB_URI.trim(),
  database: process.env.MONGODB_DATABASE?.trim() || 'ticket_bot',
};
