import type { Database } from '../database/types.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import { getMarketState } from '../portfolio/utils.js';
import { findTickersByNames } from '../tickers/data.js';
import { formatPercentageChange } from '../utils/formatting.js';
import { getMarketTickers, setMarketTickers } from './data.js';

type BaselineMode = 'derived' | 'real';

function pickBaseline(
  ticker: { closePrice?: number; lastPriceOpen?: number; lastPricePost?: number; lastPricePre?: number },
  mode: BaselineMode,
): number | undefined {
  if (mode === 'real') return ticker.closePrice;
  const state = getMarketState();
  if (state === 'open') return ticker.lastPricePre;
  if (state === 'post') return ticker.lastPriceOpen;
  if (state === 'pre') return ticker.lastPricePost;
  return ticker.lastPricePost;
}

export async function buildMarketSummary(
  database: Database,
  chatId: number,
  mode: BaselineMode = 'derived',
): Promise<string | null> {
  const marketTickers: string[] = await getMarketTickers(database, chatId);

  if (marketTickers.length === 0) {
    return null;
  }

  const tickerDocuments = await findTickersByNames(database, marketTickers);

  type TickerChange = { symbol: string; percent: number; direction: 'up' | 'down' | 'flat' };
  const changes: TickerChange[] = [];

  for (const ticker of tickerDocuments) {
    const lastPrice = ticker.lastPrice;
    const baseline = pickBaseline(ticker, mode);
    if (typeof lastPrice !== 'number' || typeof baseline !== 'number' || baseline <= 0) continue;
    const percent = ((lastPrice - baseline) / baseline) * 100;
    const direction: TickerChange['direction'] = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
    changes.push({ symbol: ticker.name, percent, direction });
  }

  if (changes.length === 0) {
    return null;
  }

  const upCount = changes.filter(change => change.direction === 'up').length;
  const downCount = changes.filter(change => change.direction === 'down').length;
  const flatCount = changes.filter(change => change.direction === 'flat').length;

  const iconsLine = `${'🟩'.repeat(upCount)}${'⬜️'.repeat(flatCount)}${'🟥'.repeat(downCount)}`;

  const percentList = changes.map(change => change.percent).sort((firstValue, secondValue) => firstValue - secondValue);
  const middleIndex = Math.floor(percentList.length / 2);
  const median =
    percentList.length % 2 === 0
      ? (percentList[middleIndex - 1] + percentList[middleIndex]) / 2
      : percentList[middleIndex];
  const medianText = formatPercentageChange(median, 2);

  const hasFlat = flatCount > 0;
  let indicator = '🟠';
  if (!hasFlat) {
    if (upCount > downCount) {
      indicator = '🟢';
    } else if (downCount > upCount) {
      indicator = '🔴';
    } else {
      indicator = median > 0 ? '🟢' : median < 0 ? '🔴' : '🟠';
    }
  }
  const countsText = hasFlat ? `${upCount}/${flatCount}/${downCount}` : `${upCount}/${downCount}`;

  return `${iconsLine}\n${indicator} ${countsText} ${medianText}`;
}

export async function addMarketTickers(database: Database, chatId: number, tickers: string[]) {
  const current: string[] = await getMarketTickers(database, chatId);
  const additions = tickers
    .map(tickerValue => tickerValue.toUpperCase())
    .filter(upperTicker => !current.includes(upperTicker));
  if (additions.length === 0) {
    return { success: false, error: 'Already added' } as const;
  }
  const updated = [...current, ...additions];
  await setMarketTickers(database, chatId, updated);
  await TradenetWebSocket.refreshAllSubscriptions();
  return { success: true, added: additions } as const;
}

export async function listMarketTickers(database: Database, chatId: number): Promise<{ list: string[] }> {
  const list = await getMarketTickers(database, chatId);
  return { list };
}

export async function removeMarketTicker(database: Database, chatId: number, index: number) {
  const current: string[] = await getMarketTickers(database, chatId);
  if (index < 0 || index >= current.length) {
    return { success: false, error: 'Invalid index' } as const;
  }
  const removed = current[index];
  const updated = [...current.slice(0, index), ...current.slice(index + 1)];
  await setMarketTickers(database, chatId, updated);
  await TradenetWebSocket.refreshAllSubscriptions();
  return { success: true, removed } as const;
}

export async function buildMarketList(
  database: Database,
  chatId: number,
  mode: BaselineMode = 'derived',
): Promise<string[]> {
  const marketTickers: string[] = await getMarketTickers(database, chatId);
  if (marketTickers.length === 0) return [];

  const tickerDocuments = await findTickersByNames(database, marketTickers);
  const priceByTicker = new Map(
    tickerDocuments.map(ticker => [
      ticker.name,
      {
        lastPrice: ticker.lastPrice,
        baseline: pickBaseline(ticker, mode),
      },
    ]),
  );

  type MarketItem = {
    tickerName: string;
    originalIndex: number;
    percent?: number;
    icon: string;
    percentText: string;
  };

  const items: MarketItem[] = [];
  for (let originalIndex = 0; originalIndex < marketTickers.length; originalIndex++) {
    const tickerName = marketTickers[originalIndex];
    const prices = priceByTicker.get(tickerName);
    let icon = '🟠';
    let percentText = '';
    let percent: number | undefined;
    if (prices && typeof prices.lastPrice === 'number' && typeof prices.baseline === 'number' && prices.baseline > 0) {
      percent = ((prices.lastPrice - prices.baseline) / prices.baseline) * 100;
      icon = percent > 0 ? '🟢' : percent < 0 ? '🔴' : '🟠';
      percentText = formatPercentageChange(percent, 2);
    }
    items.push({ tickerName, originalIndex, percent, icon, percentText });
  }

  const numericValue = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? value : -Infinity;
  items.sort((firstItem, secondItem) => numericValue(secondItem.percent) - numericValue(firstItem.percent));

  return items.map(
    item =>
      `${item.icon} <b><a href="https://freedom24.com/charts/${item.tickerName}">${item.tickerName}</a></b> ${item.percentText} /r_m_${item.originalIndex + 1}`,
  );
}
