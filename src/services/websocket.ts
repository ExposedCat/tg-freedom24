import WebSocket from 'ws';
import type { Database } from '../types/database.js';
import { createHmac } from 'node:crypto';

export class TradenetWebSocket {
  private static instance: TradenetWebSocket | null = null;
  private ws: WebSocket | null = null;
  private database: Database | null = null;
  private adminSID: string | null = null;
  private subscribedOptions: Set<string> = new Set();

  private constructor() {}

  static initialize(database: Database): void {
    if (!TradenetWebSocket.instance) {
      TradenetWebSocket.instance = new TradenetWebSocket();
      TradenetWebSocket.instance.database = database;
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

  static async checkForNewOptionsInPortfolio(positions: { name: string }[]): Promise<void> {
    if (TradenetWebSocket.instance) {
      await TradenetWebSocket.instance.checkForNewOptionsInPortfolioInstance(positions);
    }
  }

  static isConnected(): boolean {
    return TradenetWebSocket.instance?.isConnectedInstance() ?? false;
  }

  private async connectInstance(sid: string): Promise<boolean> {
    return new Promise(resolve => {
      this.adminSID = sid;
      this.ws = new WebSocket(`wss://wss.tradernet.com/?SID=${sid}`);

      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close();
        }
        resolve(false);
      }, 10000);

      this.ws.on('message', async data => {
        try {
          const message = JSON.parse(data.toString());

          if (Array.isArray(message) && message.length >= 2) {
            const [type, payload] = message;

            if (type === 'userData' && payload.mode === 'prod') {
              clearTimeout(timeout);
              await this.subscribeToExistingPortfolios();
              resolve(true);
            } else if (type === 'q' && payload.c && payload.bbp !== undefined) {
              await this.savePriceUpdate(payload.c, payload.bbp * 100);
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      this.ws.on('error', error => {
        console.error('WebSocket error:', error);
        clearTimeout(timeout);
        resolve(false);
      });

      this.ws.on('close', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private async disconnectInstance(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.adminSID = null;
    this.subscribedOptions.clear();
  }

  private async subscribeToExistingPortfolios(): Promise<void> {
    if (!this.database) return;

    try {
      const users = await this.database.user.find({}).toArray();
      const allOptionNames = new Set<string>();

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
                allOptionNames.add(pos.i);
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching portfolio for user ${user.userId}:`, error);
        }
      }

      if (allOptionNames.size > 0) {
        await this.subscribeToOptions(Array.from(allOptionNames));
      }
    } catch (error) {
      console.error('Error subscribing to existing portfolios:', error);
    }
  }

  private async subscribeToOptions(optionNames: string[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const newOptions = optionNames.filter(name => !this.subscribedOptions.has(name));

    if (newOptions.length > 0) {
      const message = JSON.stringify(['quotes', newOptions]);
      this.ws.send(message);

      for (const option of newOptions) {
        this.subscribedOptions.add(option);
      }
    }
  }

  private async savePriceUpdate(name: string, price: number): Promise<void> {
    if (!this.database) return;

    try {
      await this.database.tickers.updateOne({ name }, { $set: { name, lastPrice: price } }, { upsert: true });
    } catch (error) {
      console.error('Error saving price update:', error);
    }
  }

  private async checkForNewOptionsInPortfolioInstance(positions: { name: string }[]): Promise<void> {
    const newOptionNames = positions.map(p => p.name).filter(name => !this.subscribedOptions.has(name));

    if (newOptionNames.length > 0) {
      await this.subscribeToOptions(newOptionNames);
    }
  }

  private isConnectedInstance(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
