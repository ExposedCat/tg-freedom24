import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { formatCurrency, formatPercentage } from '../services/formatters.js';
import { getPrices } from '../services/tickers.js';
import { fetchOrdersHistory } from '../services/freedom/orders.js';
import { getPortfolioState, validateUser } from '../services/portfolio-utils.js';

type Trade = {
  ticker: string;
  buyDate: Date;
  sellDate: Date;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  profit: number;
  percentage: number;
};

type OpenPosition = {
  ticker: string;
  instrumentName: string;
  buyDate: Date;
  buyPrice: number;
  quantity: number;
  currentValue: number;
};

function processTradeHistory(orders: any[]): {
  trades: Trade[];
  openPositions: OpenPosition[];
} {
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

export const historyController = new Composer<CustomContext>();
historyController.command('history', async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const currentYearStart = new Date();
  currentYearStart.setFullYear(currentYearStart.getFullYear(), 0, 1);
  currentYearStart.setHours(0, 0, 0, 0);

  const orderHistory = await fetchOrdersHistory(targetUser.apiKey, targetUser.secretKey, currentYearStart, tomorrow);

  if (!orderHistory?.orders?.order) {
    await ctx.text('history.error', { error: 'No order history found' });
    return;
  }

  const { trades, openPositions } = processTradeHistory(orderHistory.orders.order);

  if (trades.length === 0 && openPositions.length === 0) {
    await ctx.text('history.empty');
    return;
  }

  const finishedProfit = trades.reduce((sum, trade) => sum + trade.profit, 0);
  const finishedInvested = trades.reduce((sum, trade) => sum + trade.buyPrice * trade.quantity * 100, 0);
  const finishedPercentage = finishedInvested !== 0 ? (finishedProfit / finishedInvested) * 100 : 0;

  const openInstrumentNames = [...new Set(openPositions.map(pos => pos.instrumentName))];
  const dbPrices = await getPrices(ctx.db, openInstrumentNames);

  const tickerSummary = new Map<
    string,
    {
      profit: number;
      currentProfit: number;
      trades: Trade[];
      openPositions: OpenPosition[];
    }
  >();

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

  const allEntries = [];

  for (const [ticker, summary] of tickerSummary.entries()) {
    const isOpen = openPositions.some(pos => pos.ticker === ticker);
    const displayProfit = isOpen ? summary.currentProfit : summary.profit;
    const state = isOpen ? '⏳' : summary.profit > 0 ? 'profit' : summary.profit < 0 ? 'loss' : 'zero';
    const stateIcon = isOpen ? '⏳' : ctx.i18n.t(`portfolio.icon.state.${state}`);

    allEntries.push({
      ticker,
      profit: displayProfit,
      state: stateIcon,
      isOpen,
      summary,
    });
  }

  const summaryText = allEntries
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 15)
    .map(entry => {
      const totalItems = entry.summary.trades.length + entry.summary.openPositions.length;
      const mainLine = ctx.i18n.t('history.part.ticker_summary', {
        state: entry.state,
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
        const tradeIcon = ctx.i18n.t(`portfolio.icon.state.${tradeState}`);
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

  let totalsText = '';

  if (openPositions.length > 0) {
    const totalCurrentProfit = Array.from(tickerSummary.values()).reduce((sum, s) => sum + s.currentProfit, 0);
    const totalOpenInvested = openPositions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalCurrentInvested = finishedInvested + totalOpenInvested;
    const currentPercentage = totalCurrentInvested !== 0 ? (totalCurrentProfit / totalCurrentInvested) * 100 : 0;

    const worstCaseProfit = finishedProfit - totalOpenInvested;
    const worstCasePercentage = totalCurrentInvested !== 0 ? (worstCaseProfit / totalCurrentInvested) * 100 : 0;

    const currentState = getPortfolioState(currentPercentage);

    totalsText += ctx.i18n.t('history.part.total_line', {
      state: ctx.i18n.t(`portfolio.icon.state.${currentState}`),
      profit: formatCurrency(totalCurrentProfit),
      percentage: formatPercentage(currentPercentage),
    });

    totalsText += `\n${formatCurrency(worstCaseProfit)} ${formatPercentage(worstCasePercentage)}, ${formatCurrency(finishedProfit)} ${formatPercentage(finishedPercentage)}`;
  } else {
    const finishedState = getPortfolioState(finishedPercentage);
    totalsText += ctx.i18n.t('history.part.total_line', {
      state: ctx.i18n.t(`portfolio.icon.state.${finishedState}`),
      profit: formatCurrency(finishedProfit),
      percentage: formatPercentage(finishedPercentage),
    });
  }

  const message = ctx.i18n.t('history.full', {
    summary: summaryText,
    totals: totalsText,
  });

  await ctx.reply(message, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
});
