import { MongoClient } from 'mongodb';

import type { Database, User } from '../types/database.js';

export async function connectToDb() {
  const client = new MongoClient(process.env.DB_CONNECTION_STRING);
  await client.connect();
  const mongoDb = client.db();
  const user = mongoDb.collection<User>('user');
  const database: Database = { user };
  return database;
}
