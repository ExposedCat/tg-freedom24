import type { I18n } from '@grammyjs/i18n/dist/source/i18n.js';
import { Bot as TelegramBot, session } from 'grammy';
import { resolvePath } from '../helpers/resolve-path.js';
import { findChatById } from '../modules/chat/data.js';
import type { Database } from '../modules/database/types.js';
import { TradenetWebSocket } from '../modules/freedom/realtime.js';
import { historyController } from '../modules/history/controller.js';
import { memeController } from '../modules/meme/controller.js';
import { notificationController } from '../modules/notifications/controller.js';
import { setupNotificationHandler } from '../modules/notifications/handler.js';
import { portfolioCallbacks, portfolioController } from '../modules/portfolio/controller.js';
import { startController } from '../modules/start/controller.js';
import { subscriptionController } from '../modules/subscriptions/controller.js';
import type { Bot } from '../modules/telegram/bot.js';
import { createReplyWithTextFunc } from '../modules/telegram/context.js';
import { findUserById } from '../modules/user/data.js';
import { initLocaleEngine } from './locale-engine.js';

function extendContext(bot: Bot, database: Database) {
  bot.use(async (ctx, next) => {
    if (!ctx.chat || !ctx.from) {
      return;
    }

    ctx.text = createReplyWithTextFunc(ctx);
    ctx.db = database;

    ctx.dbEntities = {
      user: await findUserById(database, ctx.from.id),
      chat: await findChatById(database, ctx.chat.id),
    };

    await next();
  });
}

function setupMiddlewares(bot: Bot, localeEngine: I18n) {
  bot.use(
    session({
      initial: () => ({}),
    }),
  );
  bot.use(localeEngine);
  bot.catch(console.error);
}

function setupControllers(bot: Bot) {
  bot.use(startController);
  bot.use(portfolioController);
  bot.use(portfolioCallbacks);
  bot.use(subscriptionController);
  bot.use(notificationController);
  bot.use(historyController);
  bot.use(memeController);
}

export async function startBot(database: Database) {
  const bot: Bot = new TelegramBot(process.env.TOKEN);

  TradenetWebSocket.initialize(database);

  await setupNotificationHandler(bot, database);

  const adminId = process.env.ADMIN_ID;
  if (adminId) {
    const adminUser = await findUserById(database, Number(adminId));
    if (adminUser && adminUser.sid) {
      await TradenetWebSocket.connect(adminUser.sid);
    }
  }

  const localesPath = resolvePath(import.meta.url, '../locales');
  const i18n = initLocaleEngine(localesPath);

  extendContext(bot, database);
  setupMiddlewares(bot, i18n);
  setupControllers(bot);

  return new Promise(resolve =>
    bot.start({
      onStart: () => resolve(undefined),
    }),
  );
}
