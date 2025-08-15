import type { Database } from '../database/types.js';
import { getTickerDetails } from '../tickers/service.js';
import { makeApiRequest } from './api.js';
import { fetchOrdersHistory } from './orders.js';
import { TradenetWebSocket } from './realtime.js';
import type { Freedom24PortfolioResponse } from './types.js';

export type Option = {
  ticker: string;
  name: string;
  startDate: Date;
  endDate: Date;
  startPrice: number;
  currentPrice: number;
  baseTickerPrice: number;
  strike: number;
  usingMarketPrice: boolean;
  delta?: number;
  theta?: number;
  openOrderPrice?: number;
  openOrderTotal?: number;
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

    const dbDetails = await getTickerDetails(database, allTickerNames);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const twoYearsAgo = new Date(tomorrow);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    twoYearsAgo.setHours(0, 0, 0, 0);

    const orderHistory = await fetchOrdersHistory(apiKey, secretKey, twoYearsAgo, tomorrow);
    const orderDates = new Map<string, Date>();
    const lastOpenSellByInstr = new Map<string, { price: number; date: Date }>();

    if (orderHistory?.orders?.order) {
      for (const order of orderHistory.orders.order) {
        const date = new Date(order.date);
        orderDates.set(order.instr, date);
        if (order.oper === 3 && order.stat !== 21) {
          const prev = lastOpenSellByInstr.get(order.instr);
          if (!prev || date > prev.date) {
            if (typeof order.p === 'number' && order.p > 0) {
              lastOpenSellByInstr.set(order.instr, { price: order.p, date });
            }
          }
        }
      }
    }

    const positions = response.result.ps.pos.map(position => {
      const dbPrice = dbDetails.get(position.i)?.price;
      const baseTickerPrice = dbDetails.get(position.base_contract_code)?.price ?? 0;
      const currentPrice = (dbPrice ?? position.mkt_price * position.face_val_a) * position.q;
      const usingMarketPrice = dbPrice === undefined;
      const startDate = orderDates.get(position.i) || new Date(0);
      const openSell = lastOpenSellByInstr.get(position.i);
      const openOrderPrice = openSell?.price;
      const openOrderTotal = openOrderPrice ? openOrderPrice * position.face_val_a * position.q : undefined;

      return {
        ticker: position.i,
        name: position.base_contract_code,
        startDate,
        endDate: new Date(position.maturity_d),
        startPrice: position.price_a * position.face_val_a * position.q,
        currentPrice,
        baseTickerPrice,
        strike: Number(position.i.split('C').at(-1)),
        usingMarketPrice,
        delta: dbDetails.get(position.i)?.delta,
        theta: dbDetails.get(position.i)?.theta,
        openOrderPrice,
        openOrderTotal,
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
