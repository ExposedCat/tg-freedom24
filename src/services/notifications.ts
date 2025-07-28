import type { Database, Notification } from '../types/database.js';

export interface NotificationResult {
  chatId: number;
  message: string;
  updatedNotifications: Notification[];
}

export async function checkNotifications(
  database: Database,
  ticker: string,
  newPrice: number,
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  try {
    const chats = await database.chat
      .find({
        notifications: { $elemMatch: { ticker } },
      })
      .toArray();

    for (const chat of chats) {
      if (!chat.notifications) continue;

      let notificationsUpdated = false;
      const updatedNotifications = [...chat.notifications];

      for (let i = 0; i < updatedNotifications.length; i++) {
        const notification = updatedNotifications[i];
        if (notification.ticker !== ticker) continue;

        const shouldNotify = shouldTriggerNotification(notification, newPrice);
        const canNotify = canSendNotification(notification);

        if (shouldNotify && canNotify) {
          const notificationIndex = i + 1;
          const message = createNotificationMessage(notification, newPrice, notificationIndex);

          results.push({
            chatId: chat.chatId,
            message,
            updatedNotifications,
          });

          updatedNotifications[i] = {
            ...notification,
            lastNotified: new Date(),
            bounceDetected: false,
          };
          notificationsUpdated = true;
        } else if (shouldDetectBounce(notification, newPrice)) {
          updatedNotifications[i] = {
            ...notification,
            bounceDetected: true,
          };
          notificationsUpdated = true;
        }
      }

      if (notificationsUpdated) {
        await database.chat.updateOne({ chatId: chat.chatId }, { $set: { notifications: updatedNotifications } });
      }
    }
  } catch (error) {
    console.error('Error checking notifications:', error);
  }

  return results;
}

export async function subscribeToNotificationTickers(database: Database): Promise<string[]> {
  try {
    const chats = await database.chat.find({}).toArray();
    const allNotificationTickers = new Set<string>();

    for (const chat of chats) {
      if (chat.notifications && Array.isArray(chat.notifications)) {
        for (const notification of chat.notifications) {
          allNotificationTickers.add(notification.ticker);
        }
      }
    }

    return Array.from(allNotificationTickers);
  } catch (error) {
    console.error('Error getting notification tickers:', error);
    return [];
  }
}

function shouldTriggerNotification(notification: Notification, currentPrice: number): boolean {
  if (notification.direction === '>' && currentPrice >= notification.price) {
    return true;
  }
  if (notification.direction === '<' && currentPrice < notification.price) {
    return true;
  }
  return false;
}

function canSendNotification(notification: Notification): boolean {
  if (!notification.lastNotified) return true;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const lastNotified = new Date(notification.lastNotified);

  return lastNotified < fiveMinutesAgo && notification.bounceDetected;
}

function shouldDetectBounce(notification: Notification, currentPrice: number): boolean {
  if (!notification.lastNotified || notification.bounceDetected) return false;

  if (notification.direction === '>' && currentPrice <= notification.price) {
    return true;
  }
  if (notification.direction === '<' && currentPrice >= notification.price) {
    return true;
  }
  return false;
}

function createNotificationMessage(
  notification: Notification,
  currentPrice: number,
  notificationIndex: number,
): string {
  const direction = notification.direction === '>' ? 'above' : 'below';
  const targetPrice = notification.price.toFixed(1);
  const actualPrice = currentPrice.toFixed(1);

  return `🔔 ${notification.ticker} is now ${direction} $${targetPrice}!\nCurrent price: $${actualPrice}\n\nRemove this notification: /n_${notificationIndex}`;
}
