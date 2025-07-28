import type { Database, Chat } from '../types/database.js';

export async function getChat(args: { db: Database; chatId: number }): Promise<Chat | null> {
  const chat = await args.db.chat.findOne({ chatId: args.chatId });
  return chat;
}
