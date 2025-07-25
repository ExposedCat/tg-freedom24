import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { fetchPortfolio, type Option } from '../services/freedom/api.js';

function getMarketState(): 'pre' | 'open' | 'post' | 'closed' {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 10) return 'closed';
  if (h < 15 || (h === 15 && m < 30)) return 'pre';
  if (h < 22) return 'open';
  return 'post';
}

function formatTimeLeft(startDate: Date, endDate: Date): string {
  let diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) return 'now';

  const units = [
    { label: 'y', ms: 1000 * 60 * 60 * 24 * 365 },
    { label: 'm', ms: 1000 * 60 * 60 * 24 * 30 },
    { label: 'd', ms: 1000 * 60 * 60 * 24 },
    { label: 'h', ms: 1000 * 60 * 60 },
    { label: 'm', ms: 1000 * 60 },
  ];

  const result: string[] = [];
  let unitsUsed = 0;

  for (const unit of units) {
    if (unitsUsed >= 2) break;
    const value = Math.floor(diff / unit.ms);
    if (value > 0) {
      result.push(`${value}${unit.label}`);
      diff -= value * unit.ms;
      unitsUsed++;
    }
  }

  return result.length > 0 ? result.join(' ') : 'now';
}

function processPosition(position: Option) {
  const profit = position.currentPrice - position.startPrice;

  const timeLeft = formatTimeLeft(position.startDate, position.endDate);
  return {
    state: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'zero',
    name: position.name,
    change: profit.toFixed(2),
    startPrice: position.startPrice.toFixed(2),
    currentPrice: position.currentPrice.toFixed(2),
    startDate: position.startDate.toLocaleDateString(),
    endDate: position.endDate.toLocaleDateString(),
    timeLeft,
    strike: position.strike.toFixed(2),
    // strikeChange: position.strikeChange, FIXME: (${strikeChange})
  };
}

export const portfolioController = new Composer<CustomContext>();
portfolioController.command('portfolio', async ctx => {
  if (!ctx.dbEntities.user) {
    await ctx.text('start');
    return;
  }

  const { error, ...portfolio } = await fetchPortfolio(ctx.dbEntities.user.login, ctx.dbEntities.user.password);

  if (error) {
    await ctx.text('portfolio.error', { error });
    return;
  }

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
        });
      })
      .join('\n\n'),
    total: ctx.i18n.t('portfolio.part.total', {
      state: ctx.i18n.t(`portfolio.icon.state.${portfolio.total >= 0 ? 'rising' : 'falling'}`),
      total: portfolio.total.toFixed(2),
    }),
  });
});
