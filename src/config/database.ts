import { MongoClient } from 'mongodb';

import type { Chat } from '../modules/chat/types.js';
import type { Database } from '../modules/database/types.js';
import type { Ticker } from '../modules/ticker/types.js';
import type { User } from '../modules/user/types.js';

export async function connectToDb() {
  const client = new MongoClient(process.env.DB_CONNECTION_STRING);
  await client.connect();
  const mongoDb = client.db();
  const user = mongoDb.collection<User>('user');
  const chat = mongoDb.collection<Chat>('chat');
  const tickers = mongoDb.collection<Ticker>('tickers');
  const database: Database = { user, chat, tickers };
  return database;
}
