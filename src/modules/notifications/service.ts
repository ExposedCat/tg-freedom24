import type { Notification } from '../chat/types.js';
import type { Database } from '../database/types.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import { formatPrice } from '../utils/formatting.js';
import { findAllChats, findChatsWithNotifications, updateChatNotifications } from './data.js';
import { createNotificationMessage } from './utils.js';
import { canSendNotification, shouldTriggerNotification } from './validation.js';
import { shouldDetectBounce } from './validation.js';

type CreateNotificationParams = {
  database: Database;
  chatId: number;
  ticker: string;
  direction: Notification['direction'];
  price: number;
};

export async function createNotification({ database, chatId, ticker, direction, price }: CreateNotificationParams) {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentNotifications = chat?.notifications || [];

    const newNotification: Notification = {
      ticker,
      direction,
      price,
      lastNotified: null,
      bounceDetected: false,
    };

    const updatedNotifications = [...currentNotifications, newNotification];

    await database.chat.updateOne({ chatId }, { $set: { notifications: updatedNotifications } }, { upsert: true });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Notification created for ${ticker} ${direction === '>' ? '≥' : '<'} ${formatPrice(price)}`,
    };
  } catch (error) {
    console.error('Error creating notification:', error);
    return {
      success: false,
      error: `Failed to create notification for ${ticker}`,
    };
  }
}

type RemoveNotificationParams = {
  database: Database;
  chatId: number;
  index: number;
};

export async function removeNotification({ database, chatId, index }: RemoveNotificationParams) {
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

export async function processNotifications(database: Database, ticker: string, newPrice: number) {
  const results: { chatId: number; message: string }[] = [];

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
