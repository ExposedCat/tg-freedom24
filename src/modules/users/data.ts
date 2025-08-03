import type { Chat, Database, User } from '../../types/database.js';

export async function findUserById(database: Database, userId: number): Promise<User | null> {
  try {
    return await database.user.findOne({ userId });
  } catch (error) {
    console.error('[USERS-DATA] Error finding user by ID:', error);
    return null;
  }
}

export async function createUser(database: Database, user: User): Promise<void> {
  try {
    await database.user.insertOne(user);
  } catch (error) {
    console.error('[USERS-DATA] Error creating user:', error);
    throw error;
  }
}

export async function updateUserCredentials(
  database: Database,
  userId: number,
  credentials: { apiKey: string; secretKey: string; sid: string },
): Promise<void> {
  try {
    await database.user.updateOne({ userId }, { $set: credentials });
  } catch (error) {
    console.error('[USERS-DATA] Error updating user credentials:', error);
    throw error;
  }
}

export async function findChatById(database: Database, chatId: number): Promise<Chat | null> {
  try {
    return await database.chat.findOne({ chatId });
  } catch (error) {
    console.error('[USERS-DATA] Error finding chat by ID:', error);
    return null;
  }
}
