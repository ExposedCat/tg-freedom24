import { TradenetWebSocket } from '../freedom/realtime.js';
import type { CustomContext } from '../telegram/context.js';
import { formatPrice } from '../utils/formatting.js';
import { addSubscription, listSubscriptions, removeSubscription } from './service.js';
import { getTickerDetails } from '../tickers/service.js';
import { CommandGroup } from '@grammyjs/commands';

export const subscriptionController = new CommandGroup<CustomContext>();

async function sendSubscriptionsList(ctx: CustomContext) {
  const { subscriptions, priceMap } = await listSubscriptions(ctx.db, ctx.chat!.id);
  if (subscriptions.length === 0) {
    await ctx.text('subscription.list.empty');
    return;
  }
  try {
    const subscriptionList = subscriptions
      .map((ticker: string, index: number) => {
        const price = priceMap.get(ticker);
        const priceText = price ? formatPrice(price) : ctx.i18n.t('subscription.list.no_price');
        return ctx.i18n.t('subscription.list.item', {
          index: index + 1,
          ticker,
          price: priceText,
        });
      })
      .join('\n');
    await ctx.text('subscription.list.full', {
      subscriptions: subscriptionList,
      dataWarning: TradenetWebSocket.isConnected() ? '' : ` ${ctx.i18n.t('portfolio.icon.data.warning')}`,
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    await ctx.text('subscription.list.error');
  }
}

subscriptionController.command('subs', '', async ctx => {
  if (!ctx.chat) {
    return;
  }

  if (ctx.match?.trim()) {
    const ticker = ctx.match.trim().toUpperCase();
    const result = await addSubscription(ctx.db, ctx.chat.id, ticker);
    if (result.success) {
      await ctx.text('subscription.subscribe.success', { ticker });
      let price: number | undefined;
      try {
        if (TradenetWebSocket.isConnected()) {
          const realtime = await TradenetWebSocket.fetchOptionPrices([ticker], { timeoutMs: 2000 });
          price = realtime.get(ticker);
        }
        if (price === undefined) {
          const map = await getTickerDetails(ctx.db, [ticker]);
          price = map.get(ticker)?.price;
        }
      } catch (error) {
        console.error('[SUBS] Error fetching price after subscribe:', error);
      }
      if (price !== undefined) {
        await ctx.text('subscription.subscribe.price', { ticker, price: formatPrice(price) });
      }
    } else if (result.error?.includes('Already subscribed')) {
      await ctx.text('subscription.subscribe.already', { ticker });
    } else {
      await ctx.text('subscription.subscribe.error', { ticker });
    }
    return;
  }
  await sendSubscriptionsList(ctx);
});

subscriptionController.command(/r_s_(\d+)/, '', async ctx => {
  if (!ctx.chat) {
    return;
  }

  const match = ctx.match.at(1);
  if (!match) return;
  const index = parseInt(match, 10) - 1;

  const result = await removeSubscription(ctx.db, ctx.chat.id, index);

  if (result.success) {
    const ticker = result.message?.split(' ').pop() || '';
    await ctx.text('subscription.unsubscribe.success', { ticker });
    await sendSubscriptionsList(ctx);
  } else {
    await ctx.text('subscription.unsubscribe.invalid');
  }
});
