import { createHmac } from 'node:crypto';
import type { Freedom24PortfolioResponse } from './types.js';
import type { Database } from '../../types/database.js';
import { TradenetWebSocket } from '../websocket.js';
import { getPrices } from '../tickers.js';

export type Option = {
  name: string;
  startDate: Date;
  endDate: Date;
  startPrice: number;
  currentPrice: number;
  strike: number;
  usingMarketPrice: boolean;
};

export type Cash = {
  name: string;
  amount: number;
};

export type UserPortfolio = {
  cash: Cash[];
  positions: Option[];
  total: number;
};

export type PortfolioResponse = {
  error: null | string;
} & UserPortfolio;

export async function fetchPortfolio(
  apiKey: string,
  secretKey: string,
  database: Database,
): Promise<PortfolioResponse> {
  if (!apiKey || !secretKey) {
    return {
      error: 'Missing API key or secret key - please update your credentials with /start',
      cash: [],
      positions: [],
      total: 0,
    };
  }

  const cmd = 'getPositionJson';
  const nonce = Date.now().toString();
  const params = new URLSearchParams({ apiKey, cmd, nonce }).toString();

  const signature = createHmac('sha256', secretKey).update(params).digest('hex');

  try {
    const res = await fetch(`https://tradernet.com/api/v2/cmd/${cmd}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NtApi-PublicKey': apiKey,
        'X-NtApi-Sig': signature,
      },
      body: params,
    });

    if (!res.ok) {
      return { error: await res.text(), cash: [], positions: [], total: 0 };
    }

    const response: Freedom24PortfolioResponse = await res.json();

    if (!response.result || !response.result.ps || !response.result.ps.pos) {
      console.error('Invalid API response structure:', response);
      return { error: 'Invalid API response structure', cash: [], positions: [], total: 0 };
    }

    const tickerNames = response.result.ps.pos.map(pos => pos.i);
    const dbPrices = await getPrices(database, tickerNames);

    const positions = response.result.ps.pos.map(pos => {
      const dbPrice = dbPrices.get(pos.i);
      const currentPrice = dbPrice ?? pos.market_value;
      const usingMarketPrice = dbPrice === undefined;

      return {
        name: pos.base_contract_code,
        startDate: new Date(0),
        endDate: new Date(pos.maturity_d),
        startPrice: pos.price_a * 100,
        currentPrice,
        strike: Number(pos.i.split('C').at(-1)),
        usingMarketPrice,
      };
    });

    if (TradenetWebSocket.isConnected()) {
      const rawPositions = response.result.ps.pos.map(pos => ({ name: pos.i }));
      await TradenetWebSocket.checkForNewOptionsInPortfolio(rawPositions);
    }

    const portfolio: UserPortfolio = {
      cash: response.result.ps.acc.map(acc => ({
        name: acc.curr,
        amount: acc.s,
      })),
      positions,
      total: positions.reduce((total, position) => total + position.currentPrice - position.startPrice, 0),
    };

    return { error: null, ...portfolio };
  } catch (error) {
    console.error(error);
    return { error: 'internal error', cash: [], positions: [], total: 0 };
  }
}
