import type { Database } from '../database/types.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { Bot } from '../telegram/bot.js';
import { getAllNotificationTickers, processNotifications } from './service.js';

export async function setupNotificationHandler(bot: Bot, database: Database) {
  const handlePriceUpdate = async (ticker: string, price: number) => {
    try {
      const results = await processNotifications(database, ticker, price);

      for (const result of results) {
        await bot.api.sendMessage(result.chatId, result.message);
      }
    } catch (error) {
      console.error('[NOTIFY] Error handling price update for ticker:', ticker, error);
    }
  };

  TradenetWebSocket.addPriceUpdateCallback(handlePriceUpdate);

  const tickers = await getAllNotificationTickers(database);

  for (const ticker of tickers) {
    await TradenetWebSocket.subscribeToUserTicker(ticker);
  }
}
