import { CommandGroup } from '@grammyjs/commands';
import { fetchPortfolio } from '../freedom/portfolio.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { CustomContext } from '../telegram/context.js';
import { validateUser } from '../user/utils.js';
import { formatMoneyChange, formatPercentageChange } from '../utils/formatting.js';
import { getPortfolioState, processPosition } from './service.js';
import { getMarketState } from './utils.js';

export const portfolioController = new CommandGroup<CustomContext>();

function preparePositionData(ctx: CustomContext, processed: ReturnType<typeof processPosition>, index?: number) {
  const tickerShort = processed.name.replace(/\.US$/, '');
  const strikeChangeOptional = processed.strikeChange === '$0' ? '' : ` (${processed.strikeChange})`;
  return {
    ...processed,
    index,
    state: ctx.i18n.t(`portfolio.icon.state.${processed.state}`),
    urlTicker: processed.name,
    tickerShort,
    strikeChangeOptional,
    priceWarning: processed.usingMarketPrice ? ` ${ctx.i18n.t('portfolio.icon.data.warning')}` : '',
  };
}

portfolioController.command(/p|portfolio/, '', async (ctx: CustomContext) => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);

  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  const cashLines = portfolio.cash
    .filter(cash => cash.amount !== 0)
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
            const templateData = preparePositionData(ctx, processed, index + 1);
            const changePercent = processed.change === '$0' ? '0%' : `${processed.change} ${processed.percent}`;
            return ctx.i18n.t('portfolio.part.option_concise', { ...templateData, changePercent });
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

portfolioController.command(/t_(\d+)/, '', async (ctx: CustomContext) => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);
  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  const requested = Number(ctx.match?.at(1));
  const position = portfolio.positions[requested - 1];
  if (!position) return;

  const processed = processPosition(position);
  await ctx.text('portfolio.part.option', preparePositionData(ctx, processed));
});
