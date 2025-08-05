import type { Database } from '../database/types.js';

export async function findChatById(database: Database, chatId: number) {
  try {
    return await database.chat.findOne({ chatId });
  } catch (error) {
    console.error('[USERS-DATA] Error finding chat by ID:', error);
    return null;
  }
}
