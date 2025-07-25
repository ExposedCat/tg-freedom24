import { MongoClient } from 'mongodb';

import type { Database, User, Ticker } from '../types/database.js';

export async function connectToDb() {
  const client = new MongoClient(process.env.DB_CONNECTION_STRING);
  await client.connect();
  const mongoDb = client.db();
  const user = mongoDb.collection<User>('user');
  const tickers = mongoDb.collection<Ticker>('tickers');
  const database: Database = { user, tickers };
  return database;
}
