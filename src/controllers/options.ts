import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { fetchOptions } from '../services/freedom/orders.js';
import { validateUser } from '../services/portfolio-utils.js';
import { formatCurrency } from '../services/formatters.js';
import { TradenetWebSocket } from '../services/freedom/realtime.js';

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

    const optionsData = Array.isArray(response) ? response : response.result;

    if (!optionsData || (Array.isArray(optionsData) && optionsData.length === 0)) {
      await ctx.text('options.no_data', { ticker });
      return;
    }

    const options = Array.isArray(optionsData)
      ? optionsData.map((option: any) => ({
          ticker: option.ticker,
          baseContractCode: option.base_contract_code,
          lastTradeDate: option.last_trade_date,
          expireDate: option.expire_date,
          strikePrice: option.strike_price,
          optionType: option.option_type,
          contractMultiplier: option.contract_multiplier,
        }))
      : [];

    if (options.length === 0) {
      await ctx.text('options.no_options', { ticker });
      return;
    }

    const optionTickers = options.map(option => option.ticker);
    let priceMap = new Map<string, number>();

    if (TradenetWebSocket.isConnected()) {
      await ctx.text('options.fetching_prices');
      priceMap = await TradenetWebSocket.fetchOptionPrices(optionTickers);
    }

    const optionsByDate = new Map<string, typeof options>();

    for (const option of options) {
      const date = option.expireDate || 'N/A';
      if (!optionsByDate.has(date)) {
        optionsByDate.set(date, []);
      }
      optionsByDate.get(date)!.push(option);
    }

    const sortedDates = Array.from(optionsByDate.keys())
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .slice(0, 10);

    let message = ctx.i18n.t('options.title', { ticker });

    sortedDates.forEach(date => {
      const dateOptions = optionsByDate.get(date)!;

      if (dateOptions.length === 1) {
        const option = dateOptions[0];
        const strikePrice = option.strikePrice ? `$${parseFloat(option.strikePrice).toFixed(0)}` : 'N/A';
        const price = priceMap.has(option.ticker) ? formatCurrency(priceMap.get(option.ticker)!) : '$N/A';

        message += `${date} -> ${strikePrice} ${price}\n`;
      } else {
        message += `📅 ${date}\n`;

        dateOptions
          .sort((a, b) => parseFloat(a.strikePrice || '0') - parseFloat(b.strikePrice || '0'))
          .slice(0, 10)
          .forEach((option, index) => {
            const strikePrice = option.strikePrice ? `$${parseFloat(option.strikePrice).toFixed(0)}` : 'N/A';
            const price = priceMap.has(option.ticker) ? formatCurrency(priceMap.get(option.ticker)!) : '$N/A';
            const isLast = index === Math.min(dateOptions.length, 10) - 1;
            const symbol = isLast ? '└' : '├';

            message += `  ${symbol} ${strikePrice} ${price}\n`;
          });
      }
    });

    message += ctx.i18n.t('options.footer', { total: options.length });

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error(`[OPTIONS] Error fetching options for ${ticker}:`, error);
    await ctx.text('options.error', { ticker });
  }
});
