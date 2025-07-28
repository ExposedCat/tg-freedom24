import type { Database } from '../types/database.js';
import type { Bot } from '../types/telegram.js';
import { TradenetWebSocket } from './websocket.js';
import { checkNotifications, subscribeToNotificationTickers } from './notifications.js';

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
      const results = await checkNotifications(this.database, ticker, price);

      for (const result of results) {
        await this.sendMessage(result.chatId, result.message);
      }
    } catch (error) {
      console.error('Error handling notifications:', error);
    }
  }

  private async sendMessage(chatId: number, message: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(chatId, message, {
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      console.error('Error sending notification message:', error);
    }
  }

  async subscribeToNotificationTickers(): Promise<void> {
    try {
      const tickers = await subscribeToNotificationTickers(this.database);
      for (const ticker of tickers) {
        await TradenetWebSocket.subscribeToUserTicker(ticker);
      }
    } catch (error) {
      console.error('Error subscribing to notification tickers:', error);
    }
  }
}
