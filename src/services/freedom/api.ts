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
  baseTickerPrice: number;
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
  totalPercentage: number;
};

export type PortfolioResponse = {
  error: null | string;
} & UserPortfolio;

type OrderHistoryResponse = {
  orders: {
    order: Array<{
      instr: string;
      date: string;
      oper?: number;
      p?: number;
      q?: number;
      base_contract_code?: string;
      stat?: number;
      trade?: Array<{
        p: number;
        q: number;
        v: number;
        profit: number;
        date: string;
      }>;
      [key: string]: any;
    }>;
  };
};

export async function fetchOrdersHistory(
  apiKey: string,
  secretKey: string,
  fromDate: Date,
  toDate: Date,
): Promise<OrderHistoryResponse | null> {
  try {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
    const cmd = 'getOrdersHistory';
    const nonce = Date.now().toString();

    const toSign = `apiKey=${apiKey}&cmd=${cmd}&nonce=${nonce}&params=from=${from}&to=${to}`;
    const signature = createHmac('sha256', secretKey).update(toSign).digest('hex');

    const body = `apiKey=${apiKey}&cmd=${cmd}&nonce=${nonce}&params[from]=${from}&params[to]=${to}`;

    const res = await fetch(`https://tradernet.com/api/v2/cmd/${cmd}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NtApi-PublicKey': apiKey,
        'X-NtApi-Sig': signature,
      },
      body,
    });

    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch (error) {
    console.error('[API] Error fetching order history:', error);
    return null;
  }
}

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
      totalPercentage: 0,
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
      const errorText = await res.text();
      return { error: errorText, cash: [], positions: [], total: 0, totalPercentage: 0 };
    }

    const response: Freedom24PortfolioResponse = await res.json();

    if (!response.result || !response.result.ps || !response.result.ps.pos) {
      console.error('[API] Invalid API response structure:', response);
      return { error: 'Invalid API response structure', cash: [], positions: [], total: 0, totalPercentage: 0 };
    }

    const tickerNames = response.result.ps.pos.map(pos => pos.i);
    const baseTickerNames = response.result.ps.pos.map(pos => pos.base_contract_code);
    const allTickerNames = [...tickerNames, ...baseTickerNames];

    const dbPrices = await getPrices(database, allTickerNames);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const twoYearsAgo = new Date(tomorrow);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    twoYearsAgo.setHours(0, 0, 0, 0);

    const orderHistory = await fetchOrdersHistory(apiKey, secretKey, twoYearsAgo, tomorrow);
    const orderDates = new Map<string, Date>();

    if (orderHistory?.orders?.order) {
      for (const order of orderHistory.orders.order) {
        orderDates.set(order.instr, new Date(order.date));
      }
    }

    const positions = response.result.ps.pos.map(pos => {
      const dbPrice = dbPrices.get(pos.i);
      const baseTickerPrice = dbPrices.get(pos.base_contract_code) ?? 0;
      const currentPrice = (dbPrice ?? pos.market_value * pos.face_val_a) * pos.q;
      const usingMarketPrice = dbPrice === undefined;
      const startDate = orderDates.get(pos.i) || new Date(0);

      return {
        name: pos.base_contract_code,
        startDate,
        endDate: new Date(pos.maturity_d),
        startPrice: pos.price_a * pos.face_val_a * pos.q,
        currentPrice,
        baseTickerPrice,
        strike: Number(pos.i.split('C').at(-1)),
        usingMarketPrice,
      };
    });

    if (TradenetWebSocket.isConnected()) {
      const rawPositions = response.result.ps.pos.map(pos => ({ name: pos.i }));
      const basePositions = response.result.ps.pos.map(pos => ({ name: pos.base_contract_code }));
      const allPositions = [...rawPositions, ...basePositions];
      await TradenetWebSocket.checkForNewOptionsInPortfolio(allPositions);
    }

    const totalInvested = positions.reduce((total, position) => total + position.startPrice, 0);
    const totalProfit = positions.reduce((total, position) => total + position.currentPrice - position.startPrice, 0);
    const totalPercentage = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

    const portfolio: UserPortfolio = {
      cash: response.result.ps.acc.map(acc => ({
        name: acc.curr,
        amount: acc.s,
      })),
      positions,
      total: totalProfit,
      totalPercentage,
    };

    return { error: null, ...portfolio };
  } catch (error) {
    console.error('[API] Portfolio fetch error:', error);
    return { error: 'internal error', cash: [], positions: [], total: 0, totalPercentage: 0 };
  }
}
