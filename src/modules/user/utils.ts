import type { CustomContext } from '../telegram/context.js';
import { findUserById } from './data.js';

export async function validateUser(ctx: CustomContext): Promise<{
  isValid: boolean;
  targetUser?: any;
}> {
  let targetUser = ctx.dbEntities.user;

  if (ctx.message?.reply_to_message?.from?.id) {
    const repliedUserId = ctx.message.reply_to_message.from.id;
    targetUser = await findUserById(ctx.db, repliedUserId);
  }

  if (!targetUser || !targetUser.apiKey || !targetUser.secretKey) {
    await ctx.text('start');
    return { isValid: false };
  }

  return { isValid: true, targetUser };
}
