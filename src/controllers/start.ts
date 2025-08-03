import { Composer } from 'grammy';

import { TradenetWebSocket } from '../modules/freedom/realtime.js';
import { createOrUpdateUser, getUser } from '../modules/users/service.js';
import type { CustomContext } from '../types/context.js';

export const startController = new Composer<CustomContext>();
startController.command('start', async ctx => {
  if (!ctx.match || !ctx.from) {
    await ctx.text('start');
    return;
  }

  const params = ctx.match.split(' ');
  if (params.length !== 4) {
    await ctx.text('start');
    return;
  }

  const [apiKey, secretKey, login, password] = params;

  const result = await createOrUpdateUser(ctx.db, ctx.from.id, {
    apiKey,
    secretKey,
    login,
    password,
  });

  if (!result.success) {
    await ctx.text('start');
    return;
  }

  const adminId = process.env.ADMIN_ID;
  if (adminId && ctx.from.id === Number(adminId)) {
    await TradenetWebSocket.disconnect();

    const updatedUser = await getUser(ctx.db, ctx.from.id);
    if (updatedUser && updatedUser.sid) {
      await TradenetWebSocket.connect(updatedUser.sid);
    }
  }

  await ctx.text('created');
});
