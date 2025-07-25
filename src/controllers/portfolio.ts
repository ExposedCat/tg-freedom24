import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { fetchPortfolio, type Option } from '../services/freedom/api.js';
import { TradenetWebSocket } from '../services/websocket.js';
import { formatCurrency, formatPercentage, formatTimeLeft, getMarketState } from '../services/formatters.js';

function processPosition(position: Option) {
  const profit = position.currentPrice - position.startPrice;
  const percentage = position.startPrice !== 0 ? (profit / position.startPrice) * 100 : 0;
  const timeLeft = formatTimeLeft(position.startDate, position.endDate);

  return {
    state: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'zero',
    name: position.name,
    change: formatCurrency(profit),
    percent: formatPercentage(percentage),
    startPrice: position.startPrice.toFixed(0),
    currentPrice: position.currentPrice.toFixed(0),
    startDate: position.startDate.toLocaleDateString(),
    endDate: position.endDate.toLocaleDateString(),
    timeLeft,
    strike: formatCurrency(position.strike),
    usingMarketPrice: position.usingMarketPrice,
  };
}

export const portfolioController = new Composer<CustomContext>();
portfolioController.command('portfolio', async ctx => {
  if (!ctx.dbEntities.user) {
    await ctx.text('start');
    return;
  }

  if (!ctx.dbEntities.user.apiKey || !ctx.dbEntities.user.secretKey) {
    await ctx.text('start');
    return;
  }

  const { error, ...portfolio } = await fetchPortfolio(
    ctx.dbEntities.user.apiKey,
    ctx.dbEntities.user.secretKey,
    ctx.db,
  );

  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  const dataWarning = TradenetWebSocket.isConnected() ? '' : ctx.i18n.t('portfolio.icon.data.warning');

  await ctx.text('portfolio.full', {
    market: ctx.i18n.t(`portfolio.icon.market.${getMarketState()}`),
    cash: portfolio.cash
      .map(cash =>
        ctx.i18n.t(`portfolio.part.${cash.name === 'USD' || cash.name === 'EUR' ? cash.name : 'currency'}`, {
          name: cash.name,
          amount: cash.amount.toFixed(2),
        }),
      )
      .join('\n'),
    positions: portfolio.positions
      .map(position => {
        const processed = processPosition(position);
        return ctx.i18n.t('portfolio.part.option', {
          ...processed,
          state: ctx.i18n.t(`portfolio.icon.state.${processed.state}`),
          priceWarning: processed.usingMarketPrice ? ` ${ctx.i18n.t('portfolio.icon.data.warning')}` : '',
        });
      })
      .join('\n\n'),
    total: ctx.i18n.t('portfolio.part.total', {
      state: ctx.i18n.t(`portfolio.icon.state.${portfolio.total >= 0 ? 'rising' : 'falling'}`),
      total: formatCurrency(portfolio.total),
      dataWarning,
    }),
  });
});
