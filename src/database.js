import mongoose from 'mongoose';
import { config } from './config.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

export const mongoClient = { close: () => mongoose.disconnect() };

export async function connectDatabase() {
  await mongoose.connect(config.mongoUri, { dbName: config.database, serverSelectionTimeoutMS: 10000 });
  const database = mongoose.connection.db;
  await database.command({ ping: 1 });
  await require('../bot/Structures/Schemas/Server.js').init();
  console.log('MongoDB connection ready.');
  return database;
}
