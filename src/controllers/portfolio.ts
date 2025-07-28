import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { fetchPortfolio, type Option } from '../services/freedom/api.js';
import { TradenetWebSocket } from '../services/websocket.js';
import {
  formatCurrency,
  formatPercentage,
  formatTimeLeft,
  formatTimeFromNow,
  getMarketState,
} from '../services/formatters.js';
import { getUser } from '../services/user.js';

function processPosition(position: Option) {
  const profit = position.currentPrice - position.startPrice;
  const percentage = position.startPrice !== 0 ? (profit / position.startPrice) * 100 : 0;
  const timeLeft = formatTimeLeft(position.startDate, position.endDate);
  const timeFromNow = formatTimeFromNow(position.endDate);
  const strikeChange = position.baseTickerPrice - position.strike;

  return {
    state: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'zero',
    name: position.name,
    change: formatCurrency(profit),
    percent: formatPercentage(percentage),
    startPrice: position.startPrice.toFixed(0),
    currentPrice: position.currentPrice.toFixed(0),
    baseTickerPrice: position.baseTickerPrice.toFixed(0),
    startDate: position.startDate.toLocaleDateString(),
    endDate: position.endDate.toLocaleDateString(),
    timeLeft,
    timeFromNow,
    strike: formatCurrency(position.strike),
    strikeChange: formatCurrency(strikeChange),
    usingMarketPrice: position.usingMarketPrice,
  };
}

function getPortfolioState(percentage: number): string {
  if (percentage === 0) return 'nothing';
  if (percentage >= 50) return 'huge_gain';
  if (percentage >= 20) return 'moderate_gain';
  if (percentage > 0) return 'small_gain';
  if (percentage < -5) return 'small_loss';
  if (percentage < -20) return 'moderate_loss';
  if (percentage < -50) return 'significant_loss';
  return 'significant_loss';
}

export const portfolioController = new Composer<CustomContext>();
portfolioController.command('portfolio', async ctx => {
  let targetUser = ctx.dbEntities.user;

  if (ctx.message?.reply_to_message?.from?.id) {
    const repliedUserId = ctx.message.reply_to_message.from.id;
    targetUser = await getUser({
      db: ctx.db,
      userId: repliedUserId,
    });
  }

  if (!targetUser) {
    await ctx.text('start');
    return;
  }

  if (!targetUser.apiKey || !targetUser.secretKey) {
    await ctx.text('start');
    return;
  }

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);

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
    positions:
      portfolio.positions.length === 0
        ? ctx.i18n.t('portfolio.part.no_positions')
        : portfolio.positions
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
      state: ctx.i18n.t(`portfolio.icon.state.${getPortfolioState(portfolio.totalPercentage)}`),
      total: formatCurrency(portfolio.total),
      dataWarning,
    }),
  });
});
