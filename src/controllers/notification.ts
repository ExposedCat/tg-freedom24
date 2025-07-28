import { Composer } from 'grammy';
import type { CustomContext } from '../types/context.js';
import type { Notification } from '../types/database.js';
import { TradenetWebSocket } from '../services/websocket.js';

function formatPrice(amount: number): string {
  return `$${amount.toFixed(1)}`;
}

export const notificationController = new Composer<CustomContext>();

notificationController.command('notify', async ctx => {
  if (!ctx.chat) {
    return;
  }

  if (!ctx.match?.trim()) {
    await ctx.text('notification.setup.usage');
    return;
  }

  const args = ctx.match.trim().split(' ');
  if (args.length !== 2) {
    await ctx.text('notification.setup.usage');
    return;
  }

  const [ticker, priceCondition] = args;
  const tickerUpper = ticker.toUpperCase();

  const match = priceCondition.match(/^([<>])(\d+(?:\.\d+)?)$/);
  if (!match) {
    await ctx.text('notification.setup.invalid_format');
    return;
  }

  const direction = match[1] as '>' | '<';
  const price = parseFloat(match[2]) * 100;

  const currentNotifications = ctx.dbEntities.chat?.notifications || [];

  const existingIndex = currentNotifications.findIndex(
    n => n.ticker === tickerUpper && n.direction === direction && n.price === price,
  );

  if (existingIndex !== -1) {
    const escapedCondition = priceCondition.replace(/</g, '&lt;').replace(/>/g, '≥');
    await ctx.text('notification.setup.already_exists', { ticker: tickerUpper, condition: escapedCondition });
    return;
  }

  const newNotification: Notification = {
    ticker: tickerUpper,
    direction,
    price,
    lastNotified: null,
    bounceDetected: false,
  };

  const updatedNotifications = [...currentNotifications, newNotification];

  try {
    await ctx.db.chat.updateOne(
      { chatId: ctx.chat.id },
      { $set: { notifications: updatedNotifications } },
      { upsert: true },
    );

    await TradenetWebSocket.subscribeToUserTicker(tickerUpper);

    await ctx.text('notification.setup.success', {
      ticker: tickerUpper,
      direction: direction === '>' ? '≥' : '&lt;',
      price: formatPrice(price / 100),
    });
  } catch (error) {
    console.error('Error setting up notification:', error);
    await ctx.text('notification.setup.error', { ticker: tickerUpper });
  }
});

notificationController.hears(/^\/n_(\d+)$/, async ctx => {
  if (!ctx.chat) {
    return;
  }

  const match = ctx.message?.text?.match(/^\/n_(\d+)$/);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1;
  const currentNotifications = ctx.dbEntities.chat?.notifications || [];

  if (index < 0 || index >= currentNotifications.length) {
    await ctx.text('notification.remove.invalid');
    return;
  }

  const notification = currentNotifications[index];
  const updatedNotifications = currentNotifications.filter((_: Notification, i: number) => i !== index);

  try {
    await ctx.db.chat.updateOne({ chatId: ctx.chat.id }, { $set: { notifications: updatedNotifications } });

    await ctx.text('notification.remove.success', {
      ticker: notification.ticker,
      direction: notification.direction === '>' ? '≥' : '&lt;',
      price: formatPrice(notification.price / 100),
    });
  } catch (error) {
    console.error('Error removing notification:', error);
    await ctx.text('notification.remove.error');
  }
});

notificationController.command('notifications', async ctx => {
  if (!ctx.chat) {
    return;
  }

  const notifications = ctx.dbEntities.chat?.notifications || [];

  if (notifications.length === 0) {
    await ctx.text('notification.list.empty');
    return;
  }

  try {
    const tickers = [...new Set(notifications.map(n => n.ticker))];
    const tickerPrices = await ctx.db.tickers.find({ name: { $in: tickers } }).toArray();

    const priceMap = new Map(tickerPrices.map(t => [t.name, t.lastPrice]));

    const notificationList = notifications
      .map((notification: Notification, index: number) => {
        const currentPrice = priceMap.get(notification.ticker);
        const currentPriceText = currentPrice
          ? formatPrice(currentPrice / 100)
          : ctx.i18n.t('notification.list.no_price');
        const targetPrice = formatPrice(notification.price / 100);

        return ctx.i18n.t('notification.list.item', {
          index: index + 1,
          ticker: notification.ticker,
          direction: notification.direction === '>' ? '≥' : '&lt;',
          targetPrice,
          currentPrice: currentPriceText,
        });
      })
      .join('\n');

    await ctx.text('notification.list.full', {
      notifications: notificationList,
      dataWarning: TradenetWebSocket.isConnected() ? '' : ` ${ctx.i18n.t('portfolio.icon.data.warning')}`,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    await ctx.text('notification.list.error');
  }
});
