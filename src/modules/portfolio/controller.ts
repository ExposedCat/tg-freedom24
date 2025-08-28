import { CommandGroup } from '@grammyjs/commands';
import { Composer } from 'grammy';
import { fetchPortfolio } from '../freedom/portfolio.js';
import type { UserPortfolio } from '../freedom/portfolio.js';
import type { CustomContext } from '../telegram/context.js';
import { buildRefreshMarkup } from '../telegram/markup.js';
import { findUserById } from '../user/data.js';
import { validateUser } from '../user/utils.js';
import { formatMoneyChange, formatPercentageChange } from '../utils/formatting.js';
import { getPortfolioState, processPosition } from './service.js';
import { getMarketEmoji, getMarketState, getTimeLeftForCurrentMarketState } from './utils.js';

export const portfolioController = new CommandGroup<CustomContext>();
export const portfolioCallbacks = new Composer<CustomContext>();

function preparePositionData(ctx: CustomContext, processed: ReturnType<typeof processPosition>, index?: number) {
  const tickerShort = processed.name.replace(/\.US$/, '');
  const strikeChangeOptional = processed.strikeChange === '$0' ? '' : ` (${processed.strikeChange})`;
  const breakEvenChangeOptional = processed.breakEvenChange === '$0' ? '' : ` (${processed.breakEvenChange})`;
  const openOrderOptional = processed.openOrder ? `\n${processed.openOrder}` : '';
  const openOrderExtendedOptional = processed.openOrderExtended ? `\n${processed.openOrderExtended}` : '';
  return {
    ...processed,
    index,
    state: ctx.i18n.t(`portfolio.icon.state.${processed.state}`),
    urlTicker: processed.name,
    tickerShort,
    strikeChangeOptional,
    breakEvenChangeOptional,
    openOrderOptional,
    openOrderExtendedOptional,
    priceWarning: processed.usingMarketPrice ? ` ${ctx.i18n.t('portfolio.icon.data.warning')}` : '',
  };
}

function buildPortfolioContent(ctx: CustomContext, portfolio: UserPortfolio): string {
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

  const currentState = getMarketState();
  const totalConcise = ctx.i18n.t('portfolio.part.total_concise', {
    state: ctx.i18n.t(`portfolio.icon.state.${getPortfolioState(portfolio.totalPercentage)}`),
    total: formatMoneyChange(portfolio.total),
    percentage: formatPercentageChange(portfolio.totalPercentage),
    marketShort: `${getMarketEmoji(currentState)} ${getTimeLeftForCurrentMarketState()}`,
  });

  const contentParts = [] as string[];
  if (cashLines.trim().length > 0) contentParts.push(cashLines);
  if (positionsConcise.trim().length > 0) contentParts.push(positionsConcise);
  contentParts.push(totalConcise);

  return contentParts.join('\n\n');
}

function getRefreshMarkup(ctx: CustomContext, ownerUserId: number) {
  return buildRefreshMarkup(ctx.i18n.t('portfolio.refresh'), `portfolio_refresh:${ownerUserId}`);
}

portfolioController.command(/p|portfolio/, '', async (ctx: CustomContext) => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);

  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  const content = buildPortfolioContent(ctx, portfolio);
  await ctx.text(
    'portfolio.concise',
    { content },
    {
      reply_markup: getRefreshMarkup(ctx, targetUser.userId),
    },
  );
});

portfolioController.command(/t_(\d+)/, '', async (ctx: CustomContext) => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);
  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

  const requested = Number(ctx.commandMatch.match?.at(1));
  const position = portfolio.positions[requested - 1];
  if (!position) return;

  const processed = processPosition(position);
  await ctx.text('portfolio.part.option', preparePositionData(ctx, processed));
});

portfolioCallbacks.callbackQuery(/portfolio_refresh:(\d+)/, async (ctx: CustomContext) => {
  const ownerId = Number(ctx.callbackQuery!.data!.split(':')[1]);
  const targetUser = await findUserById(ctx.db, ownerId);
  if (!targetUser) {
    await ctx.answerCallbackQuery();
    return;
  }

  const { error, ...portfolio } = await fetchPortfolio(targetUser.apiKey, targetUser.secretKey, ctx.db);
  if (error) {
    await ctx.answerCallbackQuery();
    return;
  }

  const content = buildPortfolioContent(ctx, portfolio);
  const text = ctx.i18n.t('portfolio.concise', { content });

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: getRefreshMarkup(ctx, targetUser.userId),
    });
  } catch {
    // ignore
  }

  await ctx.answerCallbackQuery();
});
