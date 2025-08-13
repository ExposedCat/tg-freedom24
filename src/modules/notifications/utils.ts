import type { Notification } from '../chat/types.js';

export function parseNotificationCondition(condition: string) {
  const match = condition.match(/^([<>])(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const direction = match[1] as '>' | '<';
  const price = parseFloat(match[2]);

  return { direction, price };
}

export function createNotificationMessage(
  notification: Notification,
  currentPrice: number,
  notificationIndex: number,
): string {
  const direction = notification.direction === '>' ? 'above' : 'below';
  const targetPrice = notification.price.toFixed(1);
  const actualPrice = currentPrice.toFixed(1);

  return `${direction === 'above' ? '🟢' : '🔴'} ${notification.ticker} is now ${direction} $${targetPrice}!\nCurrent price: $${actualPrice}\n\nRemove this notification: /n_${notificationIndex}`;
}
