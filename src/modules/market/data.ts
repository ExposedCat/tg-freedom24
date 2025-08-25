import type { Database } from '../database/types.js';

export async function getMarketTickers(database: Database, chatId: number): Promise<string[]> {
  try {
    const chat = await database.chat.findOne({ chatId });
    return chat?.market || [];
  } catch (error) {
    console.error('[MARKET-DATA] Error fetching market tickers:', error);
    return [];
  }
}

export function setMarketTickers(database: Database, chatId: number, tickers: string[]) {
  return database.chat.updateOne({ chatId }, { $set: { market: tickers } }, { upsert: true });
}
