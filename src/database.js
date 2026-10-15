import mongoose from 'mongoose';
import { config } from './config.js';

export const mongoClient = { close: () => mongoose.disconnect() };

export async function connectDatabase() {
  await mongoose.connect(config.mongoUri, { dbName: config.database, serverSelectionTimeoutMS: 10000 });
  const database = mongoose.connection.db;
  await database.command({ ping: 1 });
  console.log('MongoDB bağlantısı hazır.');
  return database;
}
