import type { Chat, Database, Notification } from '../../types/database.js';

export async function findChatsWithNotifications(database: Database, ticker: string): Promise<Chat[]> {
  try {
    return await database.chat
      .find({
        notifications: {
          $elemMatch: { ticker },
        },
      })
      .toArray();
  } catch (error) {
    console.error('[NOTIFICATIONS-DATA] Error finding chats with notifications:', error);
    return [];
  }
}

export async function updateChatNotifications(
  database: Database,
  chatId: number,
  notifications: Notification[],
): Promise<void> {
  try {
    await database.chat.updateOne({ chatId }, { $set: { notifications } });
  } catch (error) {
    console.error('[NOTIFICATIONS-DATA] Error updating chat notifications:', error);
    throw error;
  }
}

export async function findAllChats(database: Database): Promise<Chat[]> {
  try {
    return await database.chat.find({}).toArray();
  } catch (error) {
    console.error('[NOTIFICATIONS-DATA] Error finding all chats:', error);
    return [];
  }
}
