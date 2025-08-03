import { Composer } from 'grammy';

import { fetchOptions } from '../modules/freedom/orders.js';
import { TradenetWebSocket } from '../modules/freedom/realtime.js';
import {
  enrichOptionsWithPrices,
  formatOptionsMessage,
  groupOptionsByDate,
  processOptionsData,
} from '../modules/trading/service.js';
import { validateUser } from '../services/portfolio-utils.js';
import type { CustomContext } from '../types/context.js';

export const optionsController = new Composer<CustomContext>();

optionsController.command('options', async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const commandText = ctx.message?.text || '';
  const parts = commandText.split(' ');

  if (parts.length < 2) {
    await ctx.text('options.usage');
    return;
  }

  const ticker = parts[1].toUpperCase().trim();

  if (!ticker) {
    await ctx.text('options.invalid_ticker');
    return;
  }

  await ctx.text('options.fetching', { ticker });

  try {
    const response = await fetchOptions(targetUser.apiKey, targetUser.secretKey, ticker);

    if (!response) {
      await ctx.text('options.fetch_failed', { ticker });
      return;
    }

    const options = processOptionsData(response);

    if (options.length === 0) {
      await ctx.text('options.no_options', { ticker });
      return;
    }

    if (TradenetWebSocket.isConnected()) {
      await ctx.text('options.fetching_prices');
    }

    const { enrichedOptions, priceMap } = await enrichOptionsWithPrices(options);
    const optionsByDate = groupOptionsByDate(enrichedOptions);

    const message = formatOptionsMessage(ticker, optionsByDate, priceMap, options.length, ctx.i18n.t.bind(ctx.i18n));

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(`[OPTIONS] Error fetching options for ${ticker}:`, error);
    await ctx.text('options.error', { ticker });
  }
});
