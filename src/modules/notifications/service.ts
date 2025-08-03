import type { Database, Notification } from '../../types/database.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import { findAllChats, findChatsWithNotifications, updateChatNotifications } from './data.js';

export type NotificationCondition = {
  direction: '>' | '<';
  price: number;
};

export type NotificationResult = {
  success: boolean;
  message?: string;
  error?: string;
};

export interface NotificationTriggerResult {
  chatId: number;
  message: string;
}

export function parseNotificationCondition(condition: string): NotificationCondition | null {
  const match = condition.match(/^([<>])(\d+(?:\.\d+)?)$/);
  if (!match) {
    return null;
  }

  const direction = match[1] as '>' | '<';
  const price = parseFloat(match[2]);

  return { direction, price };
}

export function formatPrice(amount: number): string {
  return `$${amount.toFixed(1)}`;
}

export async function createNotification(
  database: Database,
  chatId: number,
  ticker: string,
  condition: NotificationCondition,
): Promise<NotificationResult> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentNotifications = chat?.notifications || [];

    const existingIndex = currentNotifications.findIndex(
      n => n.ticker === ticker && n.direction === condition.direction && n.price === condition.price,
    );

    if (existingIndex !== -1) {
      const escapedCondition = `${condition.direction}${condition.price}`.replace(/</g, '&lt;').replace(/>/g, '≥');
      return {
        success: false,
        error: `Notification for ${ticker} ${escapedCondition} already exists`,
      };
    }

    const newNotification: Notification = {
      ticker,
      direction: condition.direction,
      price: condition.price,
      lastNotified: null,
      bounceDetected: false,
    };

    const updatedNotifications = [...currentNotifications, newNotification];

    await database.chat.updateOne({ chatId }, { $set: { notifications: updatedNotifications } }, { upsert: true });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Notification created for ${ticker} ${condition.direction === '>' ? '≥' : '<'} ${formatPrice(condition.price)}`,
    };
  } catch (error) {
    console.error('Error creating notification:', error);
    return {
      success: false,
      error: `Failed to create notification for ${ticker}`,
    };
  }
}

export async function removeNotification(
  database: Database,
  chatId: number,
  index: number,
): Promise<NotificationResult> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentNotifications = chat?.notifications || [];

    if (index < 0 || index >= currentNotifications.length) {
      return {
        success: false,
        error: 'Invalid notification index',
      };
    }

    const notification = currentNotifications[index];
    const updatedNotifications = currentNotifications.filter((_: Notification, i: number) => i !== index);

    await database.chat.updateOne({ chatId }, { $set: { notifications: updatedNotifications } });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Notification removed for ${notification.ticker} ${notification.direction === '>' ? '≥' : '<'} ${formatPrice(notification.price)}`,
    };
  } catch (error) {
    console.error('Error removing notification:', error);
    return {
      success: false,
      error: 'Failed to remove notification',
    };
  }
}

export async function listNotifications(
  database: Database,
  chatId: number,
): Promise<{
  notifications: Notification[];
  priceMap: Map<string, number>;
}> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const notifications = chat?.notifications || [];

    const tickers = [...new Set(notifications.map(n => n.ticker))];
    const tickerPrices = await database.tickers.find({ name: { $in: tickers } }).toArray();

    const priceMap = new Map(tickerPrices.map(t => [t.name, t.lastPrice]));

    return { notifications, priceMap };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { notifications: [], priceMap: new Map() };
  }
}

export function formatNotificationList(
  notifications: Notification[],
  priceMap: Map<string, number>,
  i18nT: (key: string, params?: any) => string,
): string {
  return notifications
    .map((notification: Notification, index: number) => {
      const currentPrice = priceMap.get(notification.ticker);
      const currentPriceText = currentPrice ? formatPrice(currentPrice) : i18nT('notification.list.no_price');
      const targetPrice = formatPrice(notification.price);

      return i18nT('notification.list.item', {
        index: index + 1,
        ticker: notification.ticker,
        direction: notification.direction === '>' ? '≥' : '&lt;',
        targetPrice,
        currentPrice: currentPriceText,
      });
    })
    .join('\n');
}

export async function processNotifications(
  database: Database,
  ticker: string,
  newPrice: number,
): Promise<NotificationTriggerResult[]> {
  const results: NotificationTriggerResult[] = [];

  try {
    const chats = await findChatsWithNotifications(database, ticker);

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
        await updateChatNotifications(database, chat.chatId, updatedNotifications);
      }
    }
  } catch (error) {
    console.error('[NOTIFICATIONS] Error processing notifications:', error);
  }

  return results;
}

export async function getAllNotificationTickers(database: Database): Promise<string[]> {
  try {
    const chats = await findAllChats(database);
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
    console.error('[NOTIFICATIONS] Error getting notification tickers:', error);
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
