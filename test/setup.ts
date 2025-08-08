import TelegramServer from 'telegram-test-api';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { Bot } from 'grammy';
import { startBot } from '../src/config/bot.js';   // тот самый your startBot()

declare global {
  var __e2e__: {
    tgServer: TelegramServer;
    bot: Bot;
    mongoSrv: MongoMemoryServer;
    mongo: MongoClient;
  };
}

export default async function setup() {
  const mongoSrv = await MongoMemoryServer.create();
  const mongo = await MongoClient.connect(mongoSrv.getUri());
  process.env.MONGO_URI = mongoSrv.getUri();

  const tgServer = new TelegramServer({});
  const { apiUrl, apiToken } = await tgServer.start();

  const bot = await startBot(mongo.db());
  bot.api.config.use((prev, m, p) =>
    prev(m, p, { apiRoot: `${apiUrl}/bot${apiToken}` }),
  );
  bot.start();

  global.__e2e__ = { tgServer, bot, mongoSrv, mongo };
}

export async function teardown() {
  const { tgServer, bot, mongoSrv, mongo } = global.__e2e__;
  await bot.stop();
  await tgServer.stop();
  await mongo.close();
  await mongoSrv.stop();
}
