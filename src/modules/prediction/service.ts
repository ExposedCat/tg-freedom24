import yahooFinance from 'yahoo-finance2';
import { TradenetWebSocket } from '../freedom/realtime.js';
import { fetchOptions } from '../freedom/orders.js';
import type { Database } from '../database/types.js';
import type { CustomContext } from '../telegram/context.js';
import type { PredictionProgress, PredictionResultItem } from './types.js';
import type { User } from '../user/types.js';

const RISK_FREE = 0.045;
const STEPS = 52;
const HORIZON_DAYS = 365;

function safeNumber(x: any): number | null {
  if (x == null) return null;
  const n = Number(String(x).replace(/[%,$\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function getSpotAndPeaks(ticker: string): Promise<{ spot: number; peak3y: number; peak3m: number } | null> {
  try {
    const hist3y = await yahooFinance.historical(ticker, { period1: new Date(Date.now() - 365 * 3 * 24 * 3600 * 1000) });
    if (!hist3y || hist3y.length === 0) return null;
    const closes3y = hist3y.map(x => x.close).filter(Boolean) as number[];
    const spot = closes3y.at(-1)!;
    const peak3y = Math.max(...closes3y);

    const hist3m = await yahooFinance.historical(ticker, { period1: new Date(Date.now() - 90 * 24 * 3600 * 1000) });
    const closes3m = hist3m.map(x => x.close).filter(Boolean) as number[];
    const peak3m = Math.max(...closes3m);

    return { spot, peak3y, peak3m };
  } catch {
    return null;
  }
}

async function annualizedRevenueGrowth(ticker: string): Promise<number | null> {
  try {
    const qs = await yahooFinance.quoteSummary(ticker, { modules: ['incomeStatementHistoryQuarterly'] as any });
    const rows = qs?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const revs = rows
      .map((r: any) => safeNumber(r.totalRevenue?.raw ?? r.totalRevenue))
      .filter((x: number | null): x is number => x != null);
    if (revs.length < 2) return null;
    const window = revs.slice(-8);
    const ratios: number[] = [];
    for (let i = 1; i < window.length; i++) {
      const a = window[i - 1];
      const b = window[i];
      if (a > 0 && b > 0) ratios.push(b / a);
    }
    if (ratios.length === 0) return null;
    const meanLog = ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length;
    const gm = Math.exp(meanLog);
    return Math.pow(gm, 4);
  } catch {
    return null;
  }
}

function bsCall(S: number, K: number, T: number, r: number, sigma: number): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return Math.max(S - K, 0);
  }
  try {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const cdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
    return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
  } catch {
    return Math.max(S - K, 0);
  }
}

function erf(x: number): number {
  // Numerical approximation of error function
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

function parseOptionName(name: string): { base: string; expiration: Date; type: 'C' | 'P'; strike: number } | null {
  // +IBM.17OCT2025.C280
  const m = name.match(/^\+([A-Z0-9.]+)\.(\d{1,2}[A-Z]{3}\d{4})\.(C|P)(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const base = m[1];
  const dstr = m[2];
  const type = m[3] as 'C' | 'P';
  const strike = Number(m[4]);
  const day = Number(dstr.slice(0, dstr.length - 8));
  const monStr = dstr.slice(-8, -5);
  const year = Number(dstr.slice(-4));
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months.indexOf(monStr.toUpperCase());
  if (month < 0) return null;
  const expiration = new Date(Date.UTC(year, month, day));
  return { base, expiration, type, strike };
}

function linearPath(S0: number, S1: number, days: number, steps: number): { date: Date; spot: number }[] {
  const start = new Date();
  const path: { date: Date; spot: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const spot = S0 + t * (S1 - S0);
    const d = new Date(start.getTime() + Math.round(t * days) * 24 * 3600 * 1000);
    path.push({ date: d, spot });
  }
  return path;
}

export async function runPrediction(
  ctx: CustomContext,
  db: Database,
  user: User,
  csvPath: string,
  settings: Required<User['predictionSettings']> & {
    commission: number;
  },
  onProgress: (p: PredictionProgress) => Promise<void>,
): Promise<PredictionResultItem[]> {
  const tickersCsv = await (await fetch(new URL(csvPath, 'file://').toString())).text();
  const lines = tickersCsv.split(/\r?\n/).filter(Boolean);
  const header = lines.shift()!;
  const tickerIndex = header.split(',').findIndex(h => h.trim() === 'Ticker');
  const tickers = lines.map(line => line.split(',')[tickerIndex]?.trim()).filter(Boolean);

  const results: PredictionResultItem[] = [];
  const now = new Date();

  let processed = 0;
  for (const ticker of tickers) {
    processed++;
    await onProgress({ status: 'running', processedTickers: processed, totalTickers: tickers.length, currentTicker: ticker, lastUpdated: new Date() });

    const spotPeaks = await getSpotAndPeaks(ticker);
    if (!spotPeaks) continue;

    const ratio3y = spotPeaks.peak3y / spotPeaks.spot;
    if (!(ratio3y > settings.peakThreshold3y)) continue;

    const gapOk = spotPeaks.spot <= spotPeaks.peak3m / settings.peakThreshold3m;
    if (!gapOk) continue;

    const gr = await annualizedRevenueGrowth(ticker);
    if (!gr || !(gr > settings.minAnnualRevenueGrowth)) continue;

    const S1 = spotPeaks.spot * gr * settings.optimismRate;

    // Build base contract code (US default)
    const base = `${ticker}.US`;
    const optRes = await fetchOptions(user.apiKey, user.secretKey, base, 'FIX');
    const optionNames: string[] = [];
    if (optRes && optRes.result) {
      for (const value of Object.values(optRes.result as any)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            const name = item.i || item.c || item.name;
            if (typeof name === 'string' && name.startsWith('+')) {
              const parsed = parseOptionName(name);
              if (parsed && parsed.type === 'C') optionNames.push(name);
            }
          }
        }
      }
    }

    if (optionNames.length === 0) {
      continue;
    }

    // Fetch quotes in batches
    const batches: string[][] = [];
    for (let i = 0; i < optionNames.length; i += 100) batches.push(optionNames.slice(i, i + 100));
    const quotes = new Map<string, any>();
    for (const b of batches) {
      const q = await TradenetWebSocket.fetchQuotes(b, 1500);
      for (const [k, v] of q) quotes.set(k, v);
    }

    const minExpDate = new Date(now);
    minExpDate.setMonth(minExpDate.getMonth() + settings.minMonths);
    const path = linearPath(spotPeaks.spot, S1, HORIZON_DAYS, STEPS);

    const perOption: PredictionResultItem[] = [];

    for (const name of optionNames) {
      const parsed = parseOptionName(name);
      if (!parsed || parsed.type !== 'C') continue;
      const q = quotes.get(name) || {};
      const bid = safeNumber(q.bbp) ?? 0;
      const ask = safeNumber(q.bap) ?? 0;
      if (!(bid > 0 && ask > 0)) continue;
      const mid = (bid + ask) / 2;
      const spreadPct = Math.max(0, (ask - bid) / ask);
      if (spreadPct > settings.maxSpreadPct) continue;
      const iv = (safeNumber(q.implied_volatility) ?? 0) / 100;
      const delta = safeNumber(q.delta) ?? 0;
      if (delta < settings.minDelta) continue;
      const oi = Number(q.open_interest ?? 0);
      const vol = Number(q.volume ?? 0);
      if (oi < settings.minOpenInterest || vol < settings.minVolume) continue;
      if (mid * 100 > settings.budget) continue;
      if (!(parsed.expiration >= minExpDate)) continue;

      const initialCost = mid * 100;
      const outcomes: { growth: number; peakDate: Date; peakSpot: number; peakOptionAdj: number }[] = [];
      for (const pt of path) {
        if (pt.date >= parsed.expiration) continue;
        const daysTo = Math.floor((pt.date.getTime() - now.getTime()) / (24 * 3600 * 1000));
        if (daysTo <= 0) continue;
        const T = (parsed.expiration.getTime() - pt.date.getTime()) / (365 * 24 * 3600 * 1000);
        const theo = bsCall(pt.spot, parsed.strike, T, RISK_FREE, iv);
        const theoAdj = Math.max(0, theo * (1 - spreadPct));
        const gross = theoAdj * 100 - initialCost;
        const net = gross - settings.commission;
        const totalReturn = net / initialCost;
        if (totalReturn <= -1) continue;
        const liqScore = Math.min(1, oi / 5000) * Math.min(1, vol / 200);
        const adj = totalReturn * liqScore;
        const daily = adj > -1 ? Math.pow(1 + adj, 1 / daysTo) - 1 : -1;
        outcomes.push({ growth: daily, peakDate: pt.date, peakSpot: pt.spot, peakOptionAdj: theoAdj });
      }
      if (outcomes.length === 0) continue;
      outcomes.sort((a, b) => b.growth - a.growth);
      const idx = Math.min(4, outcomes.length - 1);
      const cons = outcomes[idx];
      perOption.push({
        name,
        ticker,
        strike: parsed.strike,
        expiration: parsed.expiration.toISOString().slice(0, 10),
        initialPrice: mid,
        bid,
        ask,
        iv,
        delta,
        spreadPct,
        conservativeDailyGrowth: cons.growth,
        conservativePeakDate: cons.peakDate.toISOString().slice(0, 10),
        conservativePeakSpot: cons.peakSpot,
        conservativePeakOptionAdj: cons.peakOptionAdj,
        openInterest: oi,
        volume: vol,
      });
    }

    perOption.sort((a, b) => b.conservativeDailyGrowth - a.conservativeDailyGrowth);
    results.push(...perOption);
  }

  await onProgress({ status: 'done', processedTickers: processed, totalTickers: tickers.length, lastUpdated: new Date() });
  return results;
}
