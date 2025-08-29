import { Composer } from 'grammy';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { CustomContext } from '../telegram/context.js';
import { buildRefreshMarkup } from '../telegram/markup.js';
import { buildMarketList } from './service.js';

export const marketCallbacks = new Composer<CustomContext>();

marketCallbacks.callbackQuery(/market_refresh:(derived|real)/, async (ctx: CustomContext) => {
  const chatId = ctx.chat!.id;

  const mode = (ctx.commandMatch.match?.at(1) as 'derived' | 'real') ?? 'derived';
  const lines = await buildMarketList(ctx.db, chatId, mode);
  if (lines.length === 0) {
    await ctx.answerCallbackQuery();
    return;
  }

  const listBody = lines.join('\n');
  const text = ctx.i18n.t('market.list.full', {
    market: listBody,
    dataWarning: TradenetWebSocket.isConnected() ? '' : ` ${ctx.i18n.t('portfolio.icon.data.warning')}`,
  });

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: buildRefreshMarkup(ctx.i18n.t('portfolio.refresh'), `market_refresh:${mode}`),
    });
  } catch {
    // ignore
  }

  await ctx.answerCallbackQuery();
});
