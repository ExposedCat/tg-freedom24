import type { Database } from '../types/database.js';

export async function getPrices(database: Database, tickers: string[]): Promise<Map<string, number>> {
  if (tickers.length === 0) {
    return new Map();
  }

  try {
    const tickerPrices = await database.tickers.find({ name: { $in: tickers } }).toArray();

    const pricesMap = new Map<string, number>();
    for (const ticker of tickerPrices) {
      pricesMap.set(ticker.name, ticker.lastPrice);
    }

    return pricesMap;
  } catch (error) {
    console.error('Error fetching ticker prices:', error);
    return new Map();
  }
}
