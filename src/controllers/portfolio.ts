import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { fetchPortfolio, type Option } from '../services/freedom/api.js';
import { TradenetWebSocket } from '../services/websocket.js';
import { formatCurrency, formatPercentage, formatTimeLeft, getMarketState } from '../services/formatters.js';
import { getUser } from '../services/user.js';

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
  // Check if this is a reply to another user's message
  let targetUser = ctx.dbEntities.user;

  if (ctx.message?.reply_to_message?.from?.id) {
    // If replying to another message, get that user's portfolio instead
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
