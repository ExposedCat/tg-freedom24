import WebSocket from 'ws';
import type { Database } from '../database/types.js';
import { makeApiRequest } from './api.js';

type PriceUpdateCallback = (ticker: string, price: number) => Promise<void>;

export class TradenetWebSocket {
  private static instance: TradenetWebSocket | null = null;
  private ws: WebSocket | null = null;
  private database: Database | null = null;
  private adminSID: string | null = null;
  private desiredSubscriptions: Set<string> = new Set();
  private isIntentionallyDisconnected: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private baseReconnectDelay: number = 1000;
  private priceUpdateCallbacks: PriceUpdateCallback[] = [];
  private isAuthenticated: boolean = false;

  private constructor() {}

  static initialize(database: Database): void {
    if (!TradenetWebSocket.instance) {
      TradenetWebSocket.instance = new TradenetWebSocket();
      TradenetWebSocket.instance.database = database;
    }
  }

  static addPriceUpdateCallback(callback: PriceUpdateCallback): void {
    if (TradenetWebSocket.instance) {
      TradenetWebSocket.instance.priceUpdateCallbacks.push(callback);
    }
  }

  static async connect(sid: string): Promise<boolean> {
    if (!TradenetWebSocket.instance) {
      throw new Error('WebSocket not initialized. Call initialize() first.');
    }
    return TradenetWebSocket.instance.connectInstance(sid);
  }

  static async disconnect(): Promise<void> {
    if (TradenetWebSocket.instance) {
      await TradenetWebSocket.instance.disconnectInstance();
    }
  }

  static async checkForNewOptionsInPortfolio(_positions: { name: string }[]): Promise<void> {
    if (TradenetWebSocket.instance && TradenetWebSocket.instance.isAuthenticated) {
      await TradenetWebSocket.instance.refreshSubscriptions();
    }
  }

  static async subscribeToUserTicker(ticker: string): Promise<void> {
    if (TradenetWebSocket.instance && TradenetWebSocket.instance.isAuthenticated) {
      await TradenetWebSocket.instance.subscribeToOptions([ticker]);
    }
  }

  static async refreshAllSubscriptions(): Promise<void> {
    if (TradenetWebSocket.instance && TradenetWebSocket.instance.isAuthenticated) {
      await TradenetWebSocket.instance.refreshSubscriptions();
    }
  }

  static isConnected(): boolean {
    return TradenetWebSocket.instance?.isConnectedInstance() ?? false;
  }

  static async fetchOptionPrices(optionTickers: string[]): Promise<Map<string, number>> {
    if (!TradenetWebSocket.instance || !TradenetWebSocket.instance.isAuthenticated) {
      return new Map();
    }
    return TradenetWebSocket.instance.fetchOptionPricesInstance(optionTickers);
  }

  private async connectInstance(sid: string): Promise<boolean> {
    return new Promise(resolve => {
      this.adminSID = sid;
      this.isIntentionallyDisconnected = false;
      const wsUrl = `wss://wss.tradernet.com/?SID=${sid}`;

      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
        }
        resolve(false);
      }, 10000);

      this.ws.on('message', async data => {
        try {
          const rawMessage = data.toString();
          const message = JSON.parse(rawMessage);

          if (Array.isArray(message) && message.length >= 2) {
            const [type, payload] = message;

            if (type === 'userData' && payload.mode === 'prod') {
              clearTimeout(timeout);
              this.reconnectAttempts = 0;
              this.isAuthenticated = true;
              await this.initializeAllSubscriptions();
              resolve(true);
            } else if (type === 'q' && payload.c && payload.bbp !== undefined) {
              const ticker = payload.c;

              const isOption = ticker.startsWith('+');
              const multiplier = isOption ? payload.contract_multiplier || 100 : 1;
              const price = payload.bbp * multiplier;
              if (price > 0) {
                await this.savePriceUpdate(ticker, price);
                await this.notifyPriceUpdate(ticker, price);
              }
            }
          }
        } catch (error) {
          console.error('[WS] Error processing WebSocket message:', error);
        }
      });

      this.ws.on('error', error => {
        console.error('[WS] Error:', error.message);
        clearTimeout(timeout);
        resolve(false);
      });

      this.ws.on('close', () => {
        this.isAuthenticated = false;
        clearTimeout(timeout);

        if (!this.isIntentionallyDisconnected && this.adminSID) {
          this.scheduleReconnection();
        }

        resolve(false);
      });
    });
  }

  private scheduleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(async () => {
      if (this.adminSID && !this.isIntentionallyDisconnected) {
        const success = await this.connectInstance(this.adminSID);
        if (!success) {
          this.scheduleReconnection();
        }
      }
    }, delay);
  }

  private async disconnectInstance(): Promise<void> {
    this.isIntentionallyDisconnected = true;
    this.isAuthenticated = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.adminSID = null;
    this.desiredSubscriptions.clear();
    this.reconnectAttempts = 0;
  }

  private async refreshSubscriptions(): Promise<void> {
    if (!this.database || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isAuthenticated) {
      return;
    }

    const allSubscriptions = new Set<string>();

    try {
      const users = await this.database.user.find({}).toArray();
      for (const user of users) {
        try {
          if (!user.apiKey || !user.secretKey) {
            continue;
          }

          const response = await makeApiRequest(user.apiKey, user.secretKey, 'getPositionJson');

          if (response?.result?.ps?.pos) {
            for (const pos of response.result.ps.pos) {
              allSubscriptions.add(pos.i);
            }
          }
        } catch (error) {
          console.error(`[WS] Error fetching portfolio for user ${user.userId}:`, error);
        }
      }
    } catch (error) {
      console.error('[WS] Error getting portfolio subscriptions:', error);
    }

    try {
      const chats = await this.database.chat.find({}).toArray();
      for (const chat of chats) {
        if (chat.subscriptions && Array.isArray(chat.subscriptions)) {
          for (const ticker of chat.subscriptions) {
            allSubscriptions.add(ticker);
          }
        }
        if (chat.notifications && Array.isArray(chat.notifications)) {
          for (const notification of chat.notifications) {
            allSubscriptions.add(notification.ticker);
          }
        }
      }
    } catch (error) {
      console.error('[WS] Error getting chat subscriptions:', error);
    }

    if (allSubscriptions.size > 0) {
      const hasPortfolioSubs = Array.from(allSubscriptions).some(sub => sub.includes('C') || sub.includes('P'));
      if (hasPortfolioSubs) {
        this.ws.send(JSON.stringify(['portfolio']));
      }
    }

    this.desiredSubscriptions = allSubscriptions;
    if (allSubscriptions.size > 0) {
      const message = JSON.stringify(['quotes', Array.from(allSubscriptions)]);
      this.ws.send(message);
    }
  }

  private async initializeAllSubscriptions(): Promise<void> {
    await this.refreshSubscriptions();
  }

  private async subscribeToOptions(optionNames: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isAuthenticated) {
      return;
    }

    for (const option of optionNames) {
      this.desiredSubscriptions.add(option);
    }

    if (this.desiredSubscriptions.size > 0) {
      const message = JSON.stringify(['quotes', Array.from(this.desiredSubscriptions)]);
      this.ws.send(message);
    }
  }

  private async savePriceUpdate(name: string, price: number): Promise<void> {
    if (!this.database || price === 0) {
      return;
    }

    try {
      await this.database.tickers.updateOne(
        { name },
        { $set: { name, lastPrice: price, lastUpdated: new Date() } },
        { upsert: true },
      );
    } catch (error) {
      console.error(`[PRICE] Error saving price update for ${name}:`, error);
    }
  }

  private isConnectedInstance(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  private async notifyPriceUpdate(ticker: string, price: number): Promise<void> {
    for (const callback of this.priceUpdateCallbacks) {
      try {
        await callback(ticker, price);
      } catch (error) {
        console.error(`[WS] Error in price update callback for ${ticker}:`, error);
      }
    }
  }

  private async fetchOptionPricesInstance(optionTickers: string[]): Promise<Map<string, number>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isAuthenticated) {
      return new Map();
    }

    const originalSubscriptions = new Set(this.desiredSubscriptions);
    const tempSubscriptions = new Set([...originalSubscriptions, ...optionTickers]);

    const priceMap = new Map<string, number>();
    const receivedTickers = new Set<string>();

    const priceHandler = async (ticker: string, price: number): Promise<void> => {
      if (optionTickers.includes(ticker)) {
        priceMap.set(ticker, price);
        receivedTickers.add(ticker);
      }
    };

    this.priceUpdateCallbacks.push(priceHandler);

    try {
      if (tempSubscriptions.size > 0) {
        const message = JSON.stringify(['quotes', Array.from(tempSubscriptions)]);
        this.ws.send(message);
      }

      await new Promise<void>(resolve => {
        const checkComplete = () => {
          if (receivedTickers.size === optionTickers.length || receivedTickers.size > 0) {
            resolve();
          } else {
            setTimeout(checkComplete, 100);
          }
        };
        setTimeout(checkComplete, 500);
        setTimeout(resolve, 3000);
      });
    } finally {
      this.priceUpdateCallbacks = this.priceUpdateCallbacks.filter(cb => cb !== priceHandler);

      this.desiredSubscriptions = originalSubscriptions;
      if (originalSubscriptions.size > 0) {
        const restoreMessage = JSON.stringify(['quotes', Array.from(originalSubscriptions)]);
        this.ws.send(restoreMessage);
      }
    }

    return priceMap;
  }
}
