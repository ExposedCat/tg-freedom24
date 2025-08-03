import type { Database } from '../../types/database.js';
import { findTickersByNames } from './data.js';

export async function getTickerPrices(database: Database, tickerNames: string[]): Promise<Map<string, number>> {
  if (tickerNames.length === 0) {
    return new Map();
  }

  try {
    const tickers = await findTickersByNames(database, tickerNames);

    const pricesMap = new Map<string, number>();
    for (const ticker of tickers) {
      pricesMap.set(ticker.name, ticker.lastPrice);
    }

    return pricesMap;
  } catch (error) {
    console.error('[MARKET] Error fetching ticker prices:', error);
    return new Map();
  }
}
