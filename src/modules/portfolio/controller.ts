import { Composer } from 'grammy';
import { fetchPortfolio } from '../freedom/portfolio.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { CustomContext } from '../telegram/context.js';
import { validateUser } from '../user/utils.js';
import { formatMoneyChange, formatPercentageChange } from '../utils/formatting.js';
import { getPortfolioState, processPosition } from './service.js';
import { getMarketState } from './utils.js';

export const portfolioController = new Composer<CustomContext>();

portfolioController.command(['portfolio', 'p'], async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);

  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  // biome-ignore lint/correctness/noUnusedVariables: used in legacy templates
  const dataWarning = TradenetWebSocket.isConnected() ? '' : ctx.i18n.t('portfolio.icon.data.warning');

  const cashLines = portfolio.cash
    .map(cash =>
      ctx.i18n.t(`portfolio.part.${cash.name === 'USD' || cash.name === 'EUR' ? cash.name : 'currency'}`, {
        name: cash.name,
        amount: cash.amount.toFixed(2),
      }),
    )
    .join('\n');

  const positionsConcise =
    portfolio.positions.length === 0
      ? ctx.i18n.t('portfolio.part.no_positions')
      : portfolio.positions
          .map((position, index) => {
            const processed = processPosition(position);
            const tickerShort = processed.name.replace(/\.US$/, '');
            const strikeChangeOptional = processed.strikeChange === '$0' ? '' : ` (${processed.strikeChange})`;
            return ctx.i18n.t('portfolio.part.option_concise', {
              ...processed,
              index: index + 1,
              state: ctx.i18n.t(`portfolio.icon.state.${processed.state}`),
              urlTicker: processed.name,
              tickerShort,
              strikeChangeOptional,
              priceWarning: processed.usingMarketPrice ? ` ${ctx.i18n.t('portfolio.icon.data.warning')}` : '',
            });
          })
          .join('\n\n');

  const totalConcise = ctx.i18n.t('portfolio.part.total_concise', {
    state: ctx.i18n.t(`portfolio.icon.state.${getPortfolioState(portfolio.totalPercentage)}`),
    total: formatMoneyChange(portfolio.total),
    percentage: formatPercentageChange(portfolio.totalPercentage),
    marketShort: ctx.i18n.t(`portfolio.icon.market_short.${getMarketState()}`),
  });

  const contentParts = [] as string[];
  if (cashLines.trim().length > 0) contentParts.push(cashLines);
  if (positionsConcise.trim().length > 0) contentParts.push(positionsConcise);
  contentParts.push(totalConcise);

  await ctx.text('portfolio.concise', { content: contentParts.join('\n\n') });
});

portfolioController.hears(/^\/t_(\d+)$/, async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);
  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  const match = ctx.match as RegExpMatchArray;
  const requested = Number(match[1]);
  const position = portfolio.positions[requested - 1];
  if (!position) return;

  const processed = processPosition(position);
  await ctx.text('portfolio.part.option', {
    ...processed,
    state: ctx.i18n.t(`portfolio.icon.state.${processed.state}`),
    priceWarning: processed.usingMarketPrice ? ` ${ctx.i18n.t('portfolio.icon.data.warning')}` : '',
  });
});
