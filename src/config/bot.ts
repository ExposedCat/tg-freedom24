import type { I18n } from '@grammyjs/i18n/dist/source/i18n.js';
import { Bot as TelegramBot, session } from 'grammy';

import { startController } from '../controllers/start.js';
import { portfolioController } from '../controllers/portfolio.js';
import { resolvePath } from '../helpers/resolve-path.js';
import { createReplyWithTextFunc } from '../services/context.js';
import { getUser } from '../services/user.js';
import { TradenetWebSocket } from '../services/websocket.js';
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
}

export async function startBot(database: Database) {
  TradenetWebSocket.initialize(database);

  const adminId = process.env.ADMIN_ID;
  if (adminId) {
    const adminUser = await getUser({ db: database, userId: Number(adminId) });
    if (adminUser && adminUser.sid) {
      await TradenetWebSocket.connect(adminUser.sid);
    }
  }

  const bot: Bot = new TelegramBot(process.env.TOKEN);

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
