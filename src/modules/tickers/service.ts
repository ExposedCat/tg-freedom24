import type { Database } from '../database/types.js';
import { findTickersByNames } from './data.js';

export async function getTickerDetails(
  database: Database,
  tickerNames: string[],
): Promise<Map<string, { price: number; delta?: number; theta?: number }>> {
  if (tickerNames.length === 0) {
    return new Map();
  }

  try {
    const tickers = await findTickersByNames(database, tickerNames);

    const detailsMap = new Map<string, { price: number; delta?: number; theta?: number }>();
    for (const ticker of tickers) {
      detailsMap.set(ticker.name, {
        price: ticker.lastPrice,
        delta: ticker.delta,
        theta: ticker.theta,
      });
    }

    return detailsMap;
  } catch (error) {
    console.error('[MARKET] Error fetching ticker details:', error);
    return new Map();
  }
}
