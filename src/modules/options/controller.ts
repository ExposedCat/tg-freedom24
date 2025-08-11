import { Composer } from 'grammy';
import type { CustomContext } from '../telegram/context.js';
import { validateUser } from '../user/utils.js';
import { analyzeForTicker, screenTickers } from './service.js';
import {
  defaultOptionsSettings,
  getUserOptionsSettings,
  parseTickersInput,
  updateUserOptionsSettings,
} from './settings.js';

export const optionsController = new Composer<CustomContext>();

optionsController.command('options_settings', async ctx => {
  if (!ctx.from) return;
  const { isValid } = await validateUser(ctx);
  if (!isValid) return;
  const raw = (ctx.match || '').trim();
  if (!raw) {
    const cur = await getUserOptionsSettings(ctx.db, ctx.from.id);
    const text = [
      `tickers=${cur.tickers.join(',')}`,
      `budget=${cur.budget}`,
      `minMonths=${cur.minMonths}`,
      `top=${cur.top}`,
      `maxTickers=${cur.maxTickers}`,
      `commission=${cur.commission}`,
      `steps=${cur.steps}`,
      `horizonDays=${cur.horizonDays}`,
      `peakThreshold=${cur.peakThreshold}`,
      `peak3mGapPct=${cur.peak3mGapPct}`,
      `minOi=${cur.minOi}`,
      `minVol=${cur.minVol}`,
      `deltaMin=${cur.deltaMin}`,
      `deltaMax=${cur.deltaMax}`,
      `maxSpreadPct=${cur.maxSpreadPct}`,
      `sleepBase=${cur.sleepBase}`,
      `timeout=${cur.timeout}`,
      `concurrencyGlobal=${cur.concurrencyGlobal}`,
      `concurrencyExp=${cur.concurrencyExp}`,
      `optimismRate=${cur.optimismRate}`,
    ].join('\n');
    await ctx.reply(text);
    return;
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  const kv: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    kv[k] = v;
  }
  const cur = defaultOptionsSettings();
  const partial: any = {};
  for (const [k, v] of Object.entries(kv)) {
    if (k === 'tickers') partial.tickers = parseTickersInput(v);
    else if (k in cur) partial[k] = Number(v);
  }
  await updateUserOptionsSettings(ctx.db, ctx.from.id, partial);
  await ctx.reply(`ok\nupdated=${Object.keys(partial).join(',')}`);
});

optionsController.command('options', async ctx => {
  if (!ctx.from) return;
  const { isValid } = await validateUser(ctx);
  if (!isValid) return;
  const settings = await getUserOptionsSettings(ctx.db, ctx.from.id);
  if (!settings.tickers.length) {
    await ctx.reply('no tickers');
    return;
  }
  const screened = await screenTickers(settings.tickers, settings);
  if (screened.length === 0) {
    await ctx.reply('no tickers passed');
    return;
  }
  const resultsAll = [] as string[];
  for (const s of screened) {
    const results = await analyzeForTicker(s.ticker, s.baseCode, s.S1, settings);
    results
      .sort((a, b) => b.conservativeDailyGrowth - a.conservativeDailyGrowth)
      .slice(0, settings.top)
      .forEach(r => {
        resultsAll.push(
          `<a>${s.baseCode}</a> ${r.expiration} $${r.strike.toFixed(2)} <b>${(r.conservativeDailyGrowth * 100).toFixed(3)}</b>\n` +
            `$${r.initialPrice.toFixed(2)} ($${s.spot?.toFixed?.(2) ?? 'N/A'})\n` +
            `${r.conservativePeakDate ?? ''} ${r.conservativePeakOptionPrice !== undefined ? `$${r.conservativePeakOptionPrice.toFixed(2)}` : ''}  ${r.conservativePeakSpotPrice !== undefined ? `$${r.conservativePeakSpotPrice.toFixed(2)}` : ''}`,
        );
      });
    if (resultsAll.length >= settings.top) break;
  }
  if (resultsAll.length === 0) {
    await ctx.reply('no options');
    return;
  }
  const output = resultsAll.slice(0, settings.top).join('\n\n');
  await ctx.reply(output, { parse_mode: 'HTML' });
});
