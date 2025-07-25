import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { createUser, updateUser } from '../services/user.js';

export const startController = new Composer<CustomContext>();
startController.command('start', async ctx => {
  if (!ctx.match || !ctx.from) {
    await ctx.text('start');
    return;
  }

  const [login, password] = ctx.match.split(' ');

  if (!login || !password) {
    await ctx.text('start');
    return;
  }
  if (ctx.dbEntities.user) {
    await updateUser({ db: ctx.db, userId: ctx.from.id, login, password });
  } else {
    await createUser({ db: ctx.db, userId: ctx.from.id, login, password });
  }

  await ctx.text('created');
});
