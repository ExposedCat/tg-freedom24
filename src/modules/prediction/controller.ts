import { Composer, InlineKeyboard } from 'grammy';
import type { CustomContext } from '../telegram/context.js';
import { validateUser } from '../user/utils.js';
import { defaultPredictionSettings } from '../user/types.js';
import { updateUserPredictionSettings } from '../user/data.js';
import { runPrediction } from './service.js';

export const predictionController = new Composer<CustomContext>();

export function buildPredictionSummary(s: ReturnType<typeof resolveSettings>): string {
  return [
    '<b>Prediction</b>',
    '',
    `1) 3y peak/spot ≥ <b>${s.peakThreshold3y}</b>`,
    `2) 3m peak/spot ≥ <b>${s.peakThreshold3m}</b>`,
    `3) Min annual revenue growth ≥ <b>${s.minAnnualRevenueGrowth}</b>`,
    `4) Budget: <b>$${s.budget}</b>`,
    `5) Min months: <b>${s.minMonths}</b>`,
    `6) Optimism: <b>${s.optimismRate}</b>`,
    `OI ≥ <b>${s.minOpenInterest}</b>, Vol ≥ <b>${s.minVolume}</b>, Δ ≥ <b>${s.minDelta}</b>, Spread% ≤ <b>${(s.maxSpreadPct * 100).toFixed(0)}%</b>`,
    `Commission (round): <b>$1.3</b>`,
  ].join('\n');
}

function resolveSettings(user: any) {
  return { ...defaultPredictionSettings, ...(user?.predictionSettings || {}) };
}

predictionController.command('prediction', async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  await doPredictionMenu(ctx, targetUser);
});

export async function doPredictionMenu(ctx: CustomContext, user: any) {
  const s = resolveSettings(user);
  const kb = new InlineKeyboard().text('⚙️ Settings', 'prediction_settings').row().text('🚀 Start', 'prediction_start');
  await ctx.reply(buildPredictionSummary(s), { parse_mode: 'HTML', reply_markup: kb });
}

predictionController.callbackQuery('prediction_settings', async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;
  const s = resolveSettings(targetUser);

  const lines = [
    `1) 3y peak/spot: <b>${s.peakThreshold3y}</b> — /set_pr_1` ,
    `2) 3m peak/spot: <b>${s.peakThreshold3m}</b> — /set_pr_2` ,
    `3) Min annual growth: <b>${s.minAnnualRevenueGrowth}</b> — /set_pr_3` ,
    `4) Budget: <b>${s.budget}</b> — /set_pr_4` ,
    `5) Min months: <b>${s.minMonths}</b> — /set_pr_5` ,
    `6) Optimism: <b>${s.optimismRate}</b> — /set_pr_6` ,
    `OI: <b>${s.minOpenInterest}</b> — /set_pr_oi` ,
    `Vol: <b>${s.minVolume}</b> — /set_pr_vol` ,
    `Δ min: <b>${s.minDelta}</b> — /set_pr_delta` ,
    `Spread% max: <b>${s.maxSpreadPct}</b> — /set_pr_spread` ,
    `Commission (round): <b>1.3</b>`
  ].join('\n');

  await ctx.editMessageText(lines, { parse_mode: 'HTML' });
});

function numberSetter(cmd: string, key: string, parse: (txt: string) => number | null) {
  predictionController.command(cmd, async ctx => {
    const { isValid, targetUser } = await validateUser(ctx);
    if (!isValid || !targetUser || !ctx.from) return;
    const s = resolveSettings(targetUser);
    await ctx.reply(`Send a new value (current: ${String(s[key as keyof typeof s])})`, { parse_mode: 'HTML' });
    ctx.session.awaitingSetting = { userId: ctx.from.id, key } as any;
  });

  predictionController.on('message:text', async ctx => {
    const awaiting = ctx.session.awaitingSetting as any;
    if (!awaiting || awaiting.userId !== ctx.from?.id) return;
    const val = parse(ctx.message!.text!);
    if (val == null || Number.isNaN(val)) {
      await ctx.reply('Invalid number, cancelled.', { parse_mode: 'HTML' });
      ctx.session.awaitingSetting = undefined;
      return;
    }
    await updateUserPredictionSettings(ctx.db, awaiting.userId, { [key]: val });
    await ctx.reply('Updated.', { parse_mode: 'HTML' });
    ctx.session.awaitingSetting = undefined;
  });
}

numberSetter('set_pr_1', 'peakThreshold3y', txt => Number(txt));
numberSetter('set_pr_2', 'peakThreshold3m', txt => Number(txt));
numberSetter('set_pr_3', 'minAnnualRevenueGrowth', txt => Number(txt));
numberSetter('set_pr_4', 'budget', txt => Number(txt));
numberSetter('set_pr_5', 'minMonths', txt => Number(txt));
numberSetter('set_pr_6', 'optimismRate', txt => Number(txt));
numberSetter('set_pr_oi', 'minOpenInterest', txt => Number(txt));
numberSetter('set_pr_vol', 'minVolume', txt => Number(txt));
numberSetter('set_pr_delta', 'minDelta', txt => Number(txt));
numberSetter('set_pr_spread', 'maxSpreadPct', txt => Number(txt));

predictionController.callbackQuery('prediction_start', async ctx => {
  const { isValid, targetUser } = await validateUser(ctx);
  if (!isValid || !targetUser) return;

  const s = resolveSettings(targetUser);

  const msg = await ctx.reply('Starting prediction...');

  const progress = async (p: any) => {
    const lines = [
      `Status: <b>${p.status}</b>`,
      `Progress: <b>${p.processedTickers}/${p.totalTickers}</b>`,
      p.currentTicker ? `Current: <b>${p.currentTicker}</b>` : ''
    ].filter(Boolean).join('\n');
    try {
      await ctx.api.editMessageText(ctx.chat!.id, msg.message_id, lines, { parse_mode: 'HTML' });
    } catch {}
  };

  const csvPath = '/var/home/chelokot/Documents/Projects/best-options-trading/ai_beneficiaries_us_eu_optionable_v1.csv';

  const results = await runPrediction(ctx, ctx.db, targetUser, csvPath, { ...s, commission: 1.3 } as any, progress);

  if (!results.length) {
    await ctx.reply('No options found after analysis.');
    return;
  }

  const header = '<b>Results</b>\n';
  const body = results
    .sort((a,b) => b.conservativeDailyGrowth - a.conservativeDailyGrowth)
    .slice(0, 20)
    .map(r => `${r.name} — bid $${r.bid.toFixed(2)} / ask $${r.ask.toFixed(2)}; best $${r.conservativePeakOptionAdj.toFixed(2)}; Δ ${r.delta.toFixed(3)}; cons.daily ${(r.conservativeDailyGrowth*100).toFixed(2)}%`)
    .join('\n');
  await ctx.reply(header + body, { parse_mode: 'HTML' });
});
