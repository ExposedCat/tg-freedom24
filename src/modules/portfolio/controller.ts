import { Composer } from 'grammy';
import { fetchPortfolio } from '../freedom/portfolio.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { CustomContext } from '../telegram/context.js';
import { validateUser } from '../user/utils.js';
import { formatMoneyChange } from '../utils/formatting.js';
import { getPortfolioState, processPosition } from './service.js';
import { getMarketState } from './utils.js';

export const portfolioController = new Composer<CustomContext>();

portfolioController.command('portfolio', async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

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
      total: formatMoneyChange(portfolio.total),
      dataWarning,
    }),
  });
});
