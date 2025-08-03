import { TradenetWebSocket } from '../modules/freedom/realtime.js';
import { getAllNotificationTickers, processNotifications } from '../modules/notifications/service.js';
import type { Database } from '../types/database.js';
import type { Bot } from '../types/telegram.js';

export class NotificationHandler {
  private bot: Bot;
  private database: Database;

  constructor(bot: Bot, database: Database) {
    this.bot = bot;
    this.database = database;
  }

  async initialize(): Promise<void> {
    TradenetWebSocket.addPriceUpdateCallback(this.handlePriceUpdate.bind(this));
    await this.subscribeToNotificationTickers();
  }

  private async handlePriceUpdate(ticker: string, price: number): Promise<void> {
    try {
      const results = await processNotifications(this.database, ticker, price);

      for (const result of results) {
        await this.sendMessage(result.chatId, result.message);
      }
    } catch (error) {
      console.error(`[NOTIFY] Error handling notifications for ${ticker}:`, error);
    }
  }

  private async sendMessage(chatId: number, message: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, message, {
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error(`[NOTIFY] Error sending notification message to chat ${chatId}:`, error);
    }
  }

  async subscribeToNotificationTickers(): Promise<void> {
    try {
      const tickers = await getAllNotificationTickers(this.database);

      for (const ticker of tickers) {
        await TradenetWebSocket.subscribeToUserTicker(ticker);
      }
    } catch (error) {
      console.error('[NOTIFY] Error subscribing to notification tickers:', error);
    }
  }
}
