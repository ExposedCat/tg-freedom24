import type { Database } from '../database/types.js';
import { getTickerDetails } from '../tickers/service.js';
import { formatMoneyChange } from '../utils/formatting.js';
import type {
  HistoryEntry,
  OpenPosition,
  ProcessedTradeHistory,
  TickerSummary,
  Trade,
  TradeStatistics,
} from './types.js';

export function processTradeHistory(orders: any[]): ProcessedTradeHistory {
  const tickerPositions = new Map<string, { buys: any[]; sells: any[] }>();

  for (const order of orders) {
    if (order.stat !== 21 || !order.trade || order.trade.length === 0) continue;

    const ticker = order.base_contract_code || order.instr;
    if (!ticker) continue;

    if (!tickerPositions.has(ticker)) {
      tickerPositions.set(ticker, { buys: [], sells: [] });
    }

    const position = tickerPositions.get(ticker)!;

    const totalQuantity = order.trade.reduce((sum: number, t: any) => sum + (t.q ?? 0), 0);
    const totalValue = order.trade.reduce((sum: number, t: any) => sum + (t.v ?? 0), 0);
    const avgPrice = totalQuantity !== 0 ? totalValue / totalQuantity : 0;
    const orderDate = new Date(
      order.trade.reduce((min: number, t: any) => {
        const time = new Date(t.date).getTime();
        return time < min ? time : min;
      }, new Date(order.trade[0].date).getTime()),
    );
    const totalProfit = order.trade.reduce((sum: number, t: any) => sum + (t.profit ?? 0), 0);

    if (order.oper === 1) {
      position.buys.push({
        price: avgPrice,
        quantity: totalQuantity,
        date: orderDate,
        value: totalValue,
        instrumentName: order.instr,
      });
    } else if (order.oper === 3) {
      position.sells.push({
        price: avgPrice,
        quantity: totalQuantity,
        date: orderDate,
        value: totalValue,
        profit: totalProfit,
        instrumentName: order.instr,
      });
    }
  }

  const trades: Trade[] = [];
  const openPositions: OpenPosition[] = [];

  for (const [ticker, position] of tickerPositions) {
    position.buys.sort((a, b) => a.date.getTime() - b.date.getTime());
    position.sells.sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const sell of position.sells) {
      for (const buy of position.buys) {
        if (buy.quantity <= 0) continue;
        if (buy.date > sell.date) continue;

        const tradeQuantity = Math.min(buy.quantity, sell.quantity);
        const profit = sell.profit || sell.value - buy.value;
        const percentage = buy.value !== 0 ? (profit / buy.value) * 100 : 0;

        trades.push({
          ticker,
          buyDate: buy.date,
          sellDate: sell.date,
          buyPrice: buy.price,
          sellPrice: sell.price,
          quantity: tradeQuantity,
          profit,
          percentage,
        });

        buy.quantity -= tradeQuantity;
        sell.quantity -= tradeQuantity;

        if (sell.quantity <= 0) break;
      }
    }

    for (const buy of position.buys) {
      if (buy.quantity > 0) {
        openPositions.push({
          ticker,
          instrumentName: buy.instrumentName,
          buyDate: buy.date,
          buyPrice: buy.price,
          quantity: buy.quantity,
          currentValue: buy.value,
        });
      }
    }
  }

  return {
    trades: trades.sort((a, b) => b.sellDate.getTime() - a.sellDate.getTime()),
    openPositions: openPositions.sort((a, b) => b.buyDate.getTime() - a.buyDate.getTime()),
  };
}

export function calculateTradeStatistics(trades: Trade[]): TradeStatistics {
  const finishedProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const finishedInvested = trades.reduce((sum, trade) => sum + trade.buyPrice * trade.quantity * 100, 0);
  const finishedPercentage = finishedInvested !== 0 ? (finishedProfit / finishedInvested) * 100 : 0;

  return {
    finishedProfit,
    finishedInvested,
    finishedPercentage,
  };
}

export async function analyzePortfolioPerformance(
  trades: Trade[],
  openPositions: OpenPosition[],
  database: Database,
): Promise<{
  tickerSummary: Map<string, TickerSummary>;
  dbPrices: Map<string, number>;
}> {
  const openInstrumentNames = [...new Set(openPositions.map(pos => pos.instrumentName))];
  const dbDetails = await getTickerDetails(database, openInstrumentNames);
  const dbPrices = new Map<string, number>();
  for (const name of openInstrumentNames) {
    const details = dbDetails.get(name);
    if (details) dbPrices.set(name, details.price);
  }

  const tickerSummary = new Map<string, TickerSummary>();

  for (const trade of trades) {
    if (!tickerSummary.has(trade.ticker)) {
      tickerSummary.set(trade.ticker, { profit: 0, currentProfit: 0, trades: [], openPositions: [] });
    }
    const summary = tickerSummary.get(trade.ticker)!;
    summary.profit += trade.profit;
    summary.currentProfit += trade.profit;
    summary.trades.push(trade);
  }

  for (const position of openPositions) {
    if (!tickerSummary.has(position.ticker)) {
      tickerSummary.set(position.ticker, { profit: 0, currentProfit: 0, trades: [], openPositions: [] });
    }
    const summary = tickerSummary.get(position.ticker)!;

    const currentPrice = dbPrices.get(position.instrumentName) ?? 0;
    const currentValue = currentPrice * position.quantity;
    const openProfit = currentValue - position.currentValue;

    summary.currentProfit += openProfit;
    summary.openPositions.push(position);
  }

  return { tickerSummary, dbPrices };
}

export function createHistoryEntries(
  tickerSummary: Map<string, TickerSummary>,
  openPositions: OpenPosition[],
): HistoryEntry[] {
  const allEntries: HistoryEntry[] = [];

  for (const [ticker, summary] of tickerSummary.entries()) {
    const isOpen = openPositions.some(pos => pos.ticker === ticker);
    const displayProfit = isOpen ? summary.currentProfit : summary.profit;
    const state = isOpen ? 'pending' : summary.profit > 0 ? 'profit' : summary.profit < 0 ? 'loss' : 'zero';

    allEntries.push({
      ticker,
      profit: displayProfit,
      state,
      isOpen,
      summary,
    });
  }

  return allEntries
    .sort(
      (entryA, entryB) =>
        Math.max(
          0,
          ...entryB.summary.trades.map(trade => trade.buyDate.getTime()),
          ...entryB.summary.openPositions.map(position => position.buyDate.getTime()),
        ) -
        Math.max(
          0,
          ...entryA.summary.trades.map(trade => trade.buyDate.getTime()),
          ...entryA.summary.openPositions.map(position => position.buyDate.getTime()),
        ),
    )
    .slice(0, 50);
}

export function generateTradeSummaryText(
  entries: HistoryEntry[],
  dbPrices: Map<string, number>,
  i18nT: (key: string, params?: any) => string,
): string {
  return entries
    .map(entry => {
      const totalItems = entry.summary.trades.length + entry.summary.openPositions.length;
      const stateIcon = entry.isOpen ? '⏳' : i18nT(`portfolio.icon.state.${entry.state}`);

      const mainLine = i18nT('history.part.ticker_summary', {
        state: stateIcon,
        ticker: entry.ticker,
        profit: formatMoneyChange(entry.profit),
        count: totalItems > 1 ? ` (${totalItems} ${totalItems === 1 ? 'trade' : 'trades'})` : '',
      });

      if (totalItems <= 1) {
        return mainLine;
      }

      const tradeDetails: string[] = [];

      entry.summary.trades.forEach((trade, index) => {
        const tradeState = trade.profit > 0 ? 'profit' : trade.profit < 0 ? 'loss' : 'zero';
        const tradeIcon = i18nT(`portfolio.icon.state.${tradeState}`);
        const isLast = index === entry.summary.trades.length - 1 && entry.summary.openPositions.length === 0;
        const symbol = isLast ? '└' : '├';

        tradeDetails.push(
          `  ${symbol} ${trade.sellDate.toLocaleDateString()}: ${tradeIcon} ${formatMoneyChange(trade.profit)}`,
        );
      });

      entry.summary.openPositions.forEach((position, index) => {
        const currentPrice = dbPrices.get(position.instrumentName) ?? 0;
        const currentValue = currentPrice * position.quantity;
        const openProfit = currentValue - position.currentValue;
        const isLast = index === entry.summary.openPositions.length - 1;
        const symbol = isLast ? '└' : '├';

        tradeDetails.push(`  ${symbol} ${position.buyDate.toLocaleDateString()}: ⏳ ${formatMoneyChange(openProfit)}`);
      });

      return `${mainLine}\n${tradeDetails.join('\n')}`;
    })
    .join('\n');
}

export function inferBaseInvestedFromOrders(orders: any[]): number {
  const events: { date: Date; amount: number }[] = [];
  for (const order of orders) {
    if (order.stat !== 21 || !order.trade || order.trade.length === 0) continue;
    const sumValue = order.trade.reduce((sum: number, t: any) => sum + (t.v ?? 0), 0);
    const eventDate = new Date(
      order.trade.reduce((min: number, t: any) => {
        const time = new Date(t.date).getTime();
        return time < min ? time : min;
      }, new Date(order.trade[0].date).getTime()),
    );
    const sign = order.oper === 1 ? -1 : order.oper === 3 ? 1 : 0;
    if (sign === 0) continue;
    events.push({ date: eventDate, amount: sign * sumValue });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  let cash = 0;
  let baseInvested = 0;
  for (const ev of events) {
    cash += ev.amount;
    if (cash < 0) {
      baseInvested += -cash;
      cash = 0;
    }
  }
  return baseInvested;
}
