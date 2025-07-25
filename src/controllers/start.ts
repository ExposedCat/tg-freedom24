import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { createUser, updateUser, getUser } from '../services/user.js';
import { TradenetWebSocket } from '../services/websocket.js';

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

  let result;
  if (ctx.dbEntities.user) {
    result = await updateUser({
      db: ctx.db,
      userId: ctx.from.id,
      apiKey,
      secretKey,
      login,
      password,
    });
  } else {
    result = await createUser({
      db: ctx.db,
      userId: ctx.from.id,
      apiKey,
      secretKey,
      login,
      password,
    });
  }

  if (result.error) {
    await ctx.text('start');
    return;
  }

  const adminId = process.env.ADMIN_ID;
  if (adminId && ctx.from.id === Number(adminId)) {
    await TradenetWebSocket.disconnect();

    const updatedUser = await getUser({ db: ctx.db, userId: ctx.from.id });
    if (updatedUser && updatedUser.sid) {
      await TradenetWebSocket.connect(updatedUser.sid);
    }
  }

  await ctx.text('created');
});
