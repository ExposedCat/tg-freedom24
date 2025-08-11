import { Composer } from 'grammy';

import { fetchOrdersHistory } from '../freedom/orders.js';
import type { CustomContext } from '../telegram/context.js';
import { validateUser } from '../user/utils.js';
import { generateTotalsText } from './formatting.js';
import {
  analyzePortfolioPerformance,
  calculateTradeStatistics,
  createHistoryEntries,
  generateTradeSummaryText,
  processTradeHistory,
} from './service.js';

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

  const statistics = calculateTradeStatistics(trades);
  const { tickerSummary, dbPrices } = await analyzePortfolioPerformance(trades, openPositions, ctx.db);
  const historyEntries = createHistoryEntries(tickerSummary, openPositions);

  const summaryText = generateTradeSummaryText(historyEntries, dbPrices, ctx.i18n.t.bind(ctx.i18n));
  const totalsText = generateTotalsText(openPositions, tickerSummary, statistics, ctx.i18n.t.bind(ctx.i18n));

  const message = ctx.i18n.t('history.full', {
    summary: summaryText,
    totals: totalsText,
  });

  await ctx.reply(message, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
});
