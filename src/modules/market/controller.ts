import { CommandGroup } from '@grammyjs/commands';
import type { CustomContext } from '../telegram/context.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import { addMarketTickers, buildMarketList, buildMarketSummary, removeMarketTicker } from './service.js';
import { buildRefreshMarkup } from '../telegram/markup.js';

export const marketController = new CommandGroup<CustomContext>();

async function sendMarketSummary(ctx: CustomContext) {
  if (!ctx.chat) return;
  const summary = await buildMarketSummary(ctx.db, ctx.chat.id);
  if (!summary) {
    await ctx.text('market.list.empty');
    return;
  }
  await ctx.text(summary);
}

async function sendMarketList(ctx: CustomContext) {
  if (!ctx.chat) return;
  const lines = await buildMarketList(ctx.db, ctx.chat.id);
  if (lines.length === 0) {
    await ctx.text('market.list.empty');
    return;
  }
  const listBody = lines.join('\n');
  await ctx.text(
    'market.list.full',
    {
      market: listBody,
      dataWarning: TradenetWebSocket.isConnected() ? '' : ` ${ctx.i18n.t('portfolio.icon.data.warning')}`,
    },
    {
      reply_markup: buildRefreshMarkup(ctx.i18n.t('portfolio.refresh'), 'market_refresh'),
    },
  );
}

async function handleMarketCommand(ctx: CustomContext) {
  if (!ctx.chat) {
    return;
  }

  const raw = typeof ctx.match === 'string' ? ctx.match.trim() : '';
  if (!raw) {
    await sendMarketSummary(ctx);
    return;
  }

  if (raw.toLowerCase() === 'list') {
    await sendMarketList(ctx);
    return;
  }

  const tickers = raw
    .split(',')
    .map(tickerValue => tickerValue.trim())
    .filter(Boolean);
  if (tickers.length === 0) {
    await ctx.text('Usage: /market TICKER[,TICKER...] or /market list');
    return;
  }
  const result = await addMarketTickers(ctx.db, ctx.chat.id, tickers);
  if (result.success) {
    await ctx.text('market.add.success', { tickers: result.added.join(', ') });
  } else {
    await ctx.text('market.add.already');
  }
}

marketController.command('market', '', async ctx => {
  await handleMarketCommand(ctx);
});

marketController.command('m', '', async ctx => {
  await handleMarketCommand(ctx);
});

marketController.command(/r_m_(\d+)/, '', async ctx => {
  if (!ctx.chat) {
    return;
  }

  const match = ctx.commandMatch.match?.at(1);
  if (!match) return;
  const index = parseInt(match, 10) - 1;
  const result = await removeMarketTicker(ctx.db, ctx.chat.id, index);
  if (result.success) {
    await ctx.text('market.remove.success', { ticker: result.removed });
    await sendMarketList(ctx);
  } else {
    await ctx.text('market.remove.invalid');
  }
});

marketController.command('ml', '', async ctx => {
  if (!ctx.chat) {
    return;
  }
  await sendMarketList(ctx);
});
