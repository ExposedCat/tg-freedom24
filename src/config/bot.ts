import type { I18n } from '@grammyjs/i18n/dist/source/i18n.js';
import { Bot as TelegramBot, session } from 'grammy';

import { startController } from '../controllers/start.js';
import { portfolioController } from '../controllers/portfolio.js';
import { subscriptionController } from '../controllers/subscription.js';
import { notificationController } from '../controllers/notification.js';
import { resolvePath } from '../helpers/resolve-path.js';
import { createReplyWithTextFunc } from '../services/context.js';
import { getUser } from '../services/user.js';
import { getChat } from '../services/chat.js';
import { TradenetWebSocket } from '../services/websocket.js';
import { NotificationHandler } from '../services/notification-handler.js';
import type { Database } from '../types/database.js';
import type { Bot } from '../types/telegram.js';
import { initLocaleEngine } from './locale-engine.js';

function extendContext(bot: Bot, database: Database) {
  bot.use(async (ctx, next) => {
    if (!ctx.chat || !ctx.from) {
      return;
    }

    ctx.text = createReplyWithTextFunc(ctx);
    ctx.db = database;

    ctx.dbEntities = {
      user: await getUser({
        db: database,
        userId: ctx.from.id,
      }),
      chat: await getChat({
        db: database,
        chatId: ctx.chat.id,
      }),
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
  bot.use(subscriptionController);
  bot.use(notificationController);
}

export async function startBot(database: Database) {
  const bot: Bot = new TelegramBot(process.env.TOKEN);

  TradenetWebSocket.initialize(database);

  const notificationHandler = new NotificationHandler(bot, database);
  await notificationHandler.initialize();

  const adminId = process.env.ADMIN_ID;
  if (adminId) {
    const adminUser = await getUser({ db: database, userId: Number(adminId) });
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
