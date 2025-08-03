import { getUser } from '../modules/users/service.js';
import type { CustomContext } from '../types/context.js';

export function getPortfolioState(percentage: number): string {
  if (percentage === 0) return 'nothing';
  if (percentage >= 50) return 'huge_gain';
  if (percentage >= 20) return 'moderate_gain';
  if (percentage > 0) return 'small_gain';
  if (percentage < -50) return 'significant_loss';
  if (percentage < -20) return 'moderate_loss';
  if (percentage < -5) return 'small_loss';
  return 'significant_loss';
}

export async function validateUser(ctx: CustomContext): Promise<{
  isValid: boolean;
  targetUser?: any;
}> {
  let targetUser = ctx.dbEntities.user;

  if (ctx.message?.reply_to_message?.from?.id) {
    const repliedUserId = ctx.message.reply_to_message.from.id;
    targetUser = await getUser(ctx.db, repliedUserId);
  }

  if (!targetUser || !targetUser.apiKey || !targetUser.secretKey) {
    await ctx.text('start');
    return { isValid: false };
  }

  return { isValid: true, targetUser };
}
