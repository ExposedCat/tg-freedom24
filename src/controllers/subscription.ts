import { Composer } from 'grammy';
import { TradenetWebSocket } from '../modules/freedom/realtime.js';
import {
  addSubscription,
  formatSubscriptionList,
  listSubscriptions,
  removeSubscription,
} from '../modules/trading/service.js';
import type { CustomContext } from '../types/context.js';

export const subscriptionController = new Composer<CustomContext>();

subscriptionController.command('subscribe', async ctx => {
  if (!ctx.chat) {
    return;
  }

  if (!ctx.match?.trim()) {
    await ctx.text('subscription.subscribe.usage');
    return;
  }

  const ticker = ctx.match.trim().toUpperCase();

  const result = await addSubscription(ctx.db, ctx.chat.id, ticker);

  if (result.success) {
    await ctx.text('subscription.subscribe.success', { ticker });
  } else if (result.error?.includes('Already subscribed')) {
    await ctx.text('subscription.subscribe.already', { ticker });
  } else {
    await ctx.text('subscription.subscribe.error', { ticker });
  }
});

subscriptionController.hears(/^\/u_(\d+)(?:@\w+)?$/, async ctx => {
  if (!ctx.chat) {
    return;
  }

  const match = ctx.message?.text?.match(/^\/u_(\d+)(?:@\w+)?$/);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1;

  const result = await removeSubscription(ctx.db, ctx.chat.id, index);

  if (result.success) {
    const ticker = result.message?.split(' ').pop() || '';
    await ctx.text('subscription.unsubscribe.success', { ticker });
  } else {
    await ctx.text('subscription.unsubscribe.invalid');
  }
});

subscriptionController.command('subs', async ctx => {
  if (!ctx.chat) {
    return;
  }

  const { subscriptions, priceMap } = await listSubscriptions(ctx.db, ctx.chat.id);

  if (subscriptions.length === 0) {
    await ctx.text('subscription.list.empty');
    return;
  }

  try {
    const subscriptionList = formatSubscriptionList(subscriptions, priceMap, ctx.i18n.t.bind(ctx.i18n));

    await ctx.text('subscription.list.full', {
      subscriptions: subscriptionList,
      dataWarning: TradenetWebSocket.isConnected() ? '' : ` ${ctx.i18n.t('portfolio.icon.data.warning')}`,
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    await ctx.text('subscription.list.error');
  }
});
