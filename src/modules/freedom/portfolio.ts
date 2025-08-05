import type { Database } from '../database/types.js';
import { getTickerPrices } from '../tickers/service.js';
import { makeApiRequest } from './api.js';
import { fetchOrdersHistory } from './orders.js';
import { TradenetWebSocket } from './realtime.js';
import type { Freedom24PortfolioResponse } from './types.js';

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

  try {
    const response = await makeApiRequest<Freedom24PortfolioResponse>(apiKey, secretKey, 'getPositionJson');

    if (!response) {
      return { error: 'Failed to fetch portfolio data', cash: [], positions: [], total: 0, totalPercentage: 0 };
    }

    if (!response.result || !response.result.ps || !response.result.ps.pos) {
      console.error('[API] Invalid API response structure:', response);
      return { error: 'Invalid API response structure', cash: [], positions: [], total: 0, totalPercentage: 0 };
    }

    const tickerNames = response.result.ps.pos.map(pos => pos.i);
    const baseTickerNames = response.result.ps.pos.map(pos => pos.base_contract_code);
    const allTickerNames = [...tickerNames, ...baseTickerNames];

    const dbPrices = await getTickerPrices(database, allTickerNames);

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
      const currentPrice = (dbPrice ?? pos.mkt_price * pos.face_val_a) * pos.q;
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
