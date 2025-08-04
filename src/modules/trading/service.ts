import { formatCurrency, formatPercentage } from '../../services/formatters.js';
import { getPortfolioState } from '../../services/portfolio-utils.js';
import type { Database } from '../../types/database.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import { getTickerPrices } from '../market/service.js';

export type Trade = {
  ticker: string;
  buyDate: Date;
  sellDate: Date;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  profit: number;
  percentage: number;
};

export type OpenPosition = {
  ticker: string;
  instrumentName: string;
  buyDate: Date;
  buyPrice: number;
  quantity: number;
  currentValue: number;
};

export type ProcessedTradeHistory = {
  trades: Trade[];
  openPositions: OpenPosition[];
};

export type TradeStatistics = {
  finishedProfit: number;
  finishedInvested: number;
  finishedPercentage: number;
};

export type TickerSummary = {
  profit: number;
  currentProfit: number;
  trades: Trade[];
  openPositions: OpenPosition[];
};

export type HistoryEntry = {
  ticker: string;
  profit: number;
  state: string;
  isOpen: boolean;
  summary: TickerSummary;
};

export type ProcessedOption = {
  ticker: string;
  baseContractCode: string;
  lastTradeDate: string;
  expireDate: string;
  strikePrice: string;
  optionType: string;
  contractMultiplier: string;
};

export type EnrichedOption = ProcessedOption & {
  price?: number;
};

export type OptionsGroupedByDate = Map<string, EnrichedOption[]>;

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
    const trade = order.trade[0];

    if (order.oper === 1) {
      position.buys.push({
        price: trade.p,
        quantity: trade.q,
        date: new Date(trade.date),
        value: trade.v,
        instrumentName: order.instr,
      });
    } else if (order.oper === 3) {
      position.sells.push({
        price: trade.p,
        quantity: trade.q,
        date: new Date(trade.date),
        value: trade.v,
        profit: trade.profit,
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
  const dbPrices = await getTickerPrices(database, openInstrumentNames);

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

  return allEntries.sort((a, b) => b.profit - a.profit).slice(0, 15);
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
        profit: formatCurrency(entry.profit),
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
          `  ${symbol} ${trade.sellDate.toLocaleDateString()}: ${tradeIcon} ${formatCurrency(trade.profit)}`,
        );
      });

      entry.summary.openPositions.forEach((position, index) => {
        const currentPrice = dbPrices.get(position.instrumentName) ?? 0;
        const currentValue = currentPrice * position.quantity;
        const openProfit = currentValue - position.currentValue;
        const isLast = index === entry.summary.openPositions.length - 1;
        const symbol = isLast ? '└' : '├';

        tradeDetails.push(`  ${symbol} ${position.buyDate.toLocaleDateString()}: ⏳ ${formatCurrency(openProfit)}`);
      });

      return `${mainLine}\n${tradeDetails.join('\n')}`;
    })
    .join('\n');
}

export function generateTotalsText(
  openPositions: OpenPosition[],
  tickerSummary: Map<string, TickerSummary>,
  statistics: TradeStatistics,
  i18nT: (key: string, params?: any) => string,
): string {
  if (openPositions.length > 0) {
    const totalCurrentProfit = Array.from(tickerSummary.values()).reduce((sum, s) => sum + s.currentProfit, 0);
    const totalOpenInvested = openPositions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalCurrentInvested = statistics.finishedInvested + totalOpenInvested;
    const currentPercentage = totalCurrentInvested !== 0 ? (totalCurrentProfit / totalCurrentInvested) * 100 : 0;

    const worstCaseProfit = statistics.finishedProfit - totalOpenInvested;
    const worstCasePercentage = totalCurrentInvested !== 0 ? (worstCaseProfit / totalCurrentInvested) * 100 : 0;

    const currentState = getPortfolioState(currentPercentage);

    let totalsText = i18nT('history.part.total_line', {
      state: i18nT(`portfolio.icon.state.${currentState}`),
      profit: formatCurrency(totalCurrentProfit),
      percentage: formatPercentage(currentPercentage),
    });

    totalsText += `\n${formatCurrency(worstCaseProfit)} ${formatPercentage(worstCasePercentage)}, ${formatCurrency(statistics.finishedProfit)} ${formatPercentage(statistics.finishedPercentage)}`;

    return totalsText;
  } else {
    const finishedState = getPortfolioState(statistics.finishedPercentage);
    return i18nT('history.part.total_line', {
      state: i18nT(`portfolio.icon.state.${finishedState}`),
      profit: formatCurrency(statistics.finishedProfit),
      percentage: formatPercentage(statistics.finishedPercentage),
    });
  }
}

export function processOptionsData(rawData: any): ProcessedOption[] {
  const optionsData = Array.isArray(rawData) ? rawData : rawData?.result;

  if (!optionsData || (Array.isArray(optionsData) && optionsData.length === 0)) {
    return [];
  }

  return Array.isArray(optionsData)
    ? optionsData.map((option: any) => ({
        ticker: option.ticker,
        baseContractCode: option.base_contract_code,
        lastTradeDate: option.last_trade_date,
        expireDate: option.expire_date,
        strikePrice: option.strike_price,
        optionType: option.option_type,
        contractMultiplier: option.contract_multiplier,
      }))
    : [];
}

export function groupOptionsByDate(options: ProcessedOption[]): OptionsGroupedByDate {
  const optionsByDate = new Map<string, ProcessedOption[]>();

  for (const option of options) {
    const date = option.expireDate || 'N/A';
    if (!optionsByDate.has(date)) {
      optionsByDate.set(date, []);
    }
    optionsByDate.get(date)!.push(option);
  }

  return optionsByDate;
}

export async function enrichOptionsWithPrices(options: ProcessedOption[]): Promise<{
  enrichedOptions: EnrichedOption[];
  priceMap: Map<string, number>;
}> {
  const optionTickers = options.map(option => option.ticker);
  const priceMap = new Map<string, number>();

  if (TradenetWebSocket.isConnected()) {
    const rawPriceMap = await TradenetWebSocket.fetchOptionPrices(optionTickers);

    for (const [ticker, price] of rawPriceMap.entries()) {
      priceMap.set(ticker, price);
    }
  }

  const enrichedOptions = options.map(option => ({
    ...option,
    price: priceMap.get(option.ticker),
  }));

  return { enrichedOptions, priceMap };
}

export function formatOptionsMessage(
  ticker: string,
  optionsByDate: OptionsGroupedByDate,
  priceMap: Map<string, number>,
  totalOptionsCount: number,
  currentPrice: number | undefined,
  i18nT: (key: string, params?: any) => string,
): string {
  const sortedDates = Array.from(optionsByDate.keys())
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .slice(0, 10);

  let message = i18nT('options.title', { ticker });

  sortedDates.forEach(date => {
    const dateOptions = optionsByDate.get(date)!;

    if (dateOptions.length === 1) {
      const option = dateOptions[0];
      const strikePrice = option.strikePrice ? `$${parseFloat(option.strikePrice).toFixed(0)}` : 'N/A';
      const price = priceMap.has(option.ticker) ? `$${priceMap.get(option.ticker)!.toFixed(2)}` : '$N/A';
      message += `${date} -> ${strikePrice} ${price}\n`;
    } else {
      message += `📅 ${date}\n`;

      const optionsWithPrices = dateOptions.filter(
        option => priceMap.has(option.ticker) && priceMap.get(option.ticker)! > 0,
      );

      if (optionsWithPrices.length === 0) {
        message += `  └ No options with valid prices\n`;
      } else {
        let selectedOptions: EnrichedOption[];

        if (currentPrice !== undefined) {
          const allOptions = optionsWithPrices
            .map(option => ({
              ...option,
              strike: parseFloat(option.strikePrice || '0'),
            }))
            .filter(option => option.strike > 0)
            .sort((a, b) => a.strike - b.strike);

          const belowCurrent = allOptions.filter(opt => opt.strike < currentPrice);
          const atCurrent = allOptions.filter(opt => Math.abs(opt.strike - currentPrice) <= currentPrice * 0.05);
          const aboveCurrent = allOptions.filter(opt => opt.strike > currentPrice);

          const selectedBelow = belowCurrent.slice(-2);
          const selectedAt = atCurrent.slice(0, 1);
          const selectedAbove = aboveCurrent.slice(0, 7);

          selectedOptions = [...selectedBelow, ...selectedAt, ...selectedAbove].slice(0, 10);
        } else {
          selectedOptions = optionsWithPrices
            .sort((a, b) => parseFloat(a.strikePrice || '0') - parseFloat(b.strikePrice || '0'))
            .slice(0, 10);
        }

        selectedOptions.forEach((option, index) => {
          const strikePrice = option.strikePrice ? `$${parseFloat(option.strikePrice).toFixed(0)}` : 'N/A';
          const price = priceMap.has(option.ticker) ? `$${priceMap.get(option.ticker)!.toFixed(2)}` : '$N/A';
          const isLast = index === selectedOptions.length - 1;
          const symbol = isLast ? '└' : '├';

          message += `  ${symbol} ${strikePrice} ${price}\n`;
        });
      }
    }
  });

  message += i18nT('options.footer', { total: totalOptionsCount });

  return message;
}

export async function addSubscription(
  database: Database,
  chatId: number,
  ticker: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentSubscriptions = chat?.subscriptions || [];

    if (currentSubscriptions.includes(ticker)) {
      return {
        success: false,
        error: `Already subscribed to ${ticker}`,
      };
    }

    const updatedSubscriptions = [...currentSubscriptions, ticker];

    await database.chat.updateOne({ chatId }, { $set: { subscriptions: updatedSubscriptions } }, { upsert: true });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Successfully subscribed to ${ticker}`,
    };
  } catch (error) {
    console.error('Error subscribing to ticker:', error);
    return {
      success: false,
      error: `Failed to subscribe to ${ticker}`,
    };
  }
}

export async function removeSubscription(
  database: Database,
  chatId: number,
  index: number,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentSubscriptions = chat?.subscriptions || [];

    if (index < 0 || index >= currentSubscriptions.length) {
      return {
        success: false,
        error: 'Invalid subscription index',
      };
    }

    const ticker = currentSubscriptions[index];
    const updatedSubscriptions = currentSubscriptions.filter((_: string, i: number) => i !== index);

    await database.chat.updateOne({ chatId }, { $set: { subscriptions: updatedSubscriptions } });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Successfully unsubscribed from ${ticker}`,
    };
  } catch (error) {
    console.error('Error unsubscribing from ticker:', error);
    return {
      success: false,
      error: 'Failed to unsubscribe',
    };
  }
}

export async function listSubscriptions(
  database: Database,
  chatId: number,
): Promise<{
  subscriptions: string[];
  priceMap: Map<string, number>;
}> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const subscriptions = chat?.subscriptions || [];

    const tickers = await database.tickers
      .find({
        name: { $in: subscriptions },
      })
      .toArray();

    const priceMap = new Map(tickers.map(t => [t.name, t.lastPrice]));

    return { subscriptions, priceMap };
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return { subscriptions: [], priceMap: new Map() };
  }
}

export function formatSubscriptionList(
  subscriptions: string[],
  priceMap: Map<string, number>,
  i18nT: (key: string, params?: any) => string,
): string {
  function formatPrice(amount: number): string {
    return `$${amount.toFixed(1)}`;
  }

  return subscriptions
    .map((ticker: string, index: number) => {
      const price = priceMap.get(ticker);
      const priceText = price ? formatPrice(price) : i18nT('subscription.list.no_price');
      return i18nT('subscription.list.item', {
        index: index + 1,
        ticker,
        price: priceText,
      });
    })
    .join('\n');
}
