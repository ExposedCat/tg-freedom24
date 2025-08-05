import type { Database } from '../database/types.js';
import type { Ticker } from '../ticker/types.js';

export async function findTickersByNames(database: Database, tickerNames: string[]): Promise<Ticker[]> {
  if (tickerNames.length === 0) {
    return [];
  }

  try {
    return await database.tickers.find({ name: { $in: tickerNames } }).toArray();
  } catch (error) {
    console.error('[MARKET-DATA] Error fetching tickers:', error);
    return [];
  }
}
