import { Composer } from 'grammy';
import type { Notification } from '../chat/types.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { CustomContext } from '../telegram/context.js';
import { formatPrice } from '../utils/formatting.js';
import { createNotification, listNotifications, removeNotification } from './service.js';
import { parseNotificationCondition } from './utils.js';

export const notificationController = new Composer<CustomContext>();

async function sendNotificationList(ctx: CustomContext) {
  const { notifications, priceMap } = await listNotifications(ctx.db, ctx.chat!.id);

  if (notifications.length === 0) {
    await ctx.text('notification.list.empty');
    return;
  }

  try {
    const notificationList = notifications
      .map((notification: Notification, index: number) => {
        const currentPrice = priceMap.get(notification.ticker);
        const currentPriceText = currentPrice ? formatPrice(currentPrice) : ctx.i18n.t('notification.list.no_price');
        const targetPrice = formatPrice(notification.price);

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
}

notificationController.command('notify', async ctx => {
  if (!ctx.chat) {
    return;
  }

  if (!ctx.match?.trim()) {
    await sendNotificationList(ctx);
    return;
  }

  const args = ctx.match.trim().split(' ');
  if (args.length !== 2) {
    await ctx.text('notification.setup.usage');
    return;
  }

  const [ticker, priceCondition] = args;
  const tickerUpper = ticker.toUpperCase();

  const condition = parseNotificationCondition(priceCondition);
  if (!condition) {
    await ctx.text('notification.setup.invalid_format');
    return;
  }

  const result = await createNotification({
    database: ctx.db,
    chatId: ctx.chat.id,
    ticker: tickerUpper,
    direction: condition.direction,
    price: condition.price,
  });

  if (result.success) {
    await ctx.text('notification.setup.success', {
      ticker: tickerUpper,
      direction: condition.direction === '>' ? '≥' : '&lt;',
      price: condition.price.toFixed(1),
    });
  } else if (result.error?.includes('already exists')) {
    const escapedCondition = priceCondition.replace(/</g, '&lt;').replace(/>/g, '≥');
    await ctx.text('notification.setup.already_exists', { ticker: tickerUpper, condition: escapedCondition });
  } else {
    await ctx.text('notification.setup.error', { ticker: tickerUpper });
  }
});

notificationController.hears(/^\/(?:r_)?n_(\d+)(?:@\w+)?$/, async ctx => {
  if (!ctx.chat) {
    return;
  }

  const match = ctx.message?.text?.match(/^\/(?:r_)?n_(\d+)(?:@\w+)?$/);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1;

  const result = await removeNotification({
    database: ctx.db,
    chatId: ctx.chat.id,
    index,
  });

  if (result.success) {
    await ctx.text('notification.remove.success', {
      ticker: result.message?.split(' ')[3] || '',
      direction: result.message?.includes('≥') ? '≥' : '&lt;',
      price: result.message?.match(/\$[\d.]+/)?.[0] || '',
    });
    await sendNotificationList(ctx);
  } else {
    await ctx.text('notification.remove.invalid');
  }
});
