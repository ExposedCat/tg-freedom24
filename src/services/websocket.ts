import WebSocket from 'ws';
import type { Database } from '../types/database.js';
import { createHmac } from 'node:crypto';

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

      this.ws.on('open', () => {
        console.log('[WS] Connected');
      });

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
              const multiplier = payload.type === 4 ? payload.contract_multiplier || 1 : 1;
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

      this.ws.on('close', code => {
        console.log(`[WS] Disconnected (${code})`);
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

    // Get portfolio subscriptions
    try {
      const users = await this.database.user.find({}).toArray();
      for (const user of users) {
        try {
          if (!user.apiKey || !user.secretKey) {
            continue;
          }

          const cmd = 'getPositionJson';
          const nonce = Date.now().toString();
          const params = new URLSearchParams({ apiKey: user.apiKey, cmd, nonce }).toString();
          const signature = createHmac('sha256', user.secretKey).update(params).digest('hex');

          const res = await fetch(`https://tradernet.com/api/v2/cmd/${cmd}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-NtApi-PublicKey': user.apiKey,
              'X-NtApi-Sig': signature,
            },
            body: params,
          });

          if (res.ok) {
            const response = await res.json();
            if (response.result?.ps?.pos) {
              for (const pos of response.result.ps.pos) {
                allSubscriptions.add(pos.i);
              }
            }
          }
        } catch (error) {
          console.error(`[WS] Error fetching portfolio for user ${user.userId}:`, error);
        }
      }
    } catch (error) {
      console.error('[WS] Error getting portfolio subscriptions:', error);
    }

    // Get notification and subscription tickers
    try {
      const chats = await this.database.chat.find({}).toArray();
      for (const chat of chats) {
        // Add subscription tickers
        if (chat.subscriptions && Array.isArray(chat.subscriptions)) {
          for (const ticker of chat.subscriptions) {
            allSubscriptions.add(ticker);
          }
        }
        // Add notification tickers
        if (chat.notifications && Array.isArray(chat.notifications)) {
          for (const notification of chat.notifications) {
            allSubscriptions.add(notification.ticker);
          }
        }
      }
    } catch (error) {
      console.error('[WS] Error getting chat subscriptions:', error);
    }

    // Send portfolio subscription first if we have portfolio data
    if (allSubscriptions.size > 0) {
      // Check if we have any portfolio subscriptions by looking for option-like names
      const hasPortfolioSubs = Array.from(allSubscriptions).some(sub => sub.includes('C') || sub.includes('P'));
      if (hasPortfolioSubs) {
        this.ws.send(JSON.stringify(['portfolio']));
      }
    }

    // Update desired subscriptions and send quotes message
    this.desiredSubscriptions = allSubscriptions;
    if (allSubscriptions.size > 0) {
      const message = JSON.stringify(['quotes', Array.from(allSubscriptions)]);
      this.ws.send(message);
    }
  }

  private async initializeAllSubscriptions(): Promise<void> {
    // Use the same logic as refreshSubscriptions
    await this.refreshSubscriptions();
  }

  private async subscribeToOptions(optionNames: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isAuthenticated) {
      return;
    }

    // Add all options to desired subscriptions
    for (const option of optionNames) {
      this.desiredSubscriptions.add(option);
    }

    // Send ALL desired subscriptions (since quotes message replaces all)
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
}
