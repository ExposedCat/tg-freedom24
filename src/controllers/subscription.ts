import { Composer } from 'grammy';
import type { CustomContext } from '../types/context.js';
import { TradenetWebSocket } from '../services/websocket.js';

function formatPrice(amount: number): string {
  return `$${amount.toFixed(1)}`;
}

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

  const currentSubscriptions = ctx.dbEntities.chat?.subscriptions || [];

  if (currentSubscriptions.includes(ticker)) {
    await ctx.text('subscription.subscribe.already', { ticker });
    return;
  }

  const updatedSubscriptions = [...currentSubscriptions, ticker];

  try {
    await ctx.db.chat.updateOne(
      { chatId: ctx.chat.id },
      { $set: { subscriptions: updatedSubscriptions } },
      { upsert: true },
    );

    await TradenetWebSocket.subscribeToUserTicker(ticker);

    await ctx.text('subscription.subscribe.success', { ticker });
  } catch (error) {
    console.error('Error subscribing to ticker:', error);
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
  const currentSubscriptions = ctx.dbEntities.chat?.subscriptions || [];

  if (index < 0 || index >= currentSubscriptions.length) {
    await ctx.text('subscription.unsubscribe.invalid');
    return;
  }

  const ticker = currentSubscriptions[index];
  const updatedSubscriptions = currentSubscriptions.filter((_: string, i: number) => i !== index);

  try {
    await ctx.db.chat.updateOne({ chatId: ctx.chat.id }, { $set: { subscriptions: updatedSubscriptions } });

    await ctx.text('subscription.unsubscribe.success', { ticker });
  } catch (error) {
    console.error('Error unsubscribing from ticker:', error);
    await ctx.text('subscription.unsubscribe.error', { ticker });
  }
});

subscriptionController.command('subs', async ctx => {
  if (!ctx.chat) {
    return;
  }

  const subscriptions = ctx.dbEntities.chat?.subscriptions || [];

  if (subscriptions.length === 0) {
    await ctx.text('subscription.list.empty');
    return;
  }

  try {
    const tickers = await ctx.db.tickers
      .find({
        name: { $in: subscriptions },
      })
      .toArray();

    const priceMap = new Map(tickers.map(t => [t.name, t.lastPrice]));

    const subscriptionList = subscriptions
      .map((ticker: string, index: number) => {
        const price = priceMap.get(ticker);
        const priceText = price ? formatPrice(price / 100) : ctx.i18n.t('subscription.list.no_price');
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
});
