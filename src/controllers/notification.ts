import { Composer } from 'grammy';
import { TradenetWebSocket } from '../modules/freedom/realtime.js';
import {
  createNotification,
  formatNotificationList,
  listNotifications,
  parseNotificationCondition,
  removeNotification,
} from '../modules/notifications/service.js';
import type { CustomContext } from '../types/context.js';

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

  const condition = parseNotificationCondition(priceCondition);
  if (!condition) {
    await ctx.text('notification.setup.invalid_format');
    return;
  }

  const result = await createNotification(ctx.db, ctx.chat.id, tickerUpper, condition);

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

notificationController.hears(/^\/n_(\d+)(?:@\w+)?$/, async ctx => {
  if (!ctx.chat) {
    return;
  }

  const match = ctx.message?.text?.match(/^\/n_(\d+)(?:@\w+)?$/);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1;

  const result = await removeNotification(ctx.db, ctx.chat.id, index);

  if (result.success) {
    await ctx.text('notification.remove.success', {
      ticker: result.message?.split(' ')[3] || '',
      direction: result.message?.includes('≥') ? '≥' : '&lt;',
      price: result.message?.match(/\$[\d.]+/)?.[0] || '',
    });
  } else {
    await ctx.text('notification.remove.invalid');
  }
});

notificationController.command('notifications', async ctx => {
  if (!ctx.chat) {
    return;
  }

  const { notifications, priceMap } = await listNotifications(ctx.db, ctx.chat.id);

  if (notifications.length === 0) {
    await ctx.text('notification.list.empty');
    return;
  }

  try {
    const notificationList = formatNotificationList(notifications, priceMap, ctx.i18n.t.bind(ctx.i18n));

    await ctx.text('notification.list.full', {
      notifications: notificationList,
      dataWarning: TradenetWebSocket.isConnected() ? '' : ` ${ctx.i18n.t('portfolio.icon.data.warning')}`,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    await ctx.text('notification.list.error');
  }
});
