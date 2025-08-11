import type { Database } from '../database/types.js';
import type { OptionsSettings } from './types.js';

export function defaultOptionsSettings(): OptionsSettings {
  return {
    tickers: [],
    budget: 3000,
    minMonths: 6,
    top: 15,
    maxTickers: 200,
    commission: 26,
    steps: 52,
    horizonDays: 365,
    peakThreshold: 1.2,
    peak3mGapPct: 7.5,
    minOi: 150,
    minVol: 1,
    deltaMin: 0.02,
    deltaMax: 0.9,
    maxSpreadPct: 0.99,
    sleepBase: 0.6,
    timeout: 40,
    concurrencyGlobal: 8,
    concurrencyExp: 4,
    optimismRate: 1.1,
    noLessStrikePct: 10,
  };
}

export async function getUserOptionsSettings(database: Database, userId: number): Promise<OptionsSettings> {
  const user = await database.user.findOne({ userId });
  const def = defaultOptionsSettings();
  if (!user || !user.options) return def;
  return { ...def, ...user.options };
}

export async function updateUserOptionsSettings(
  database: Database,
  userId: number,
  partial: Partial<OptionsSettings>,
): Promise<OptionsSettings> {
  const current = await getUserOptionsSettings(database, userId);
  const updated = { ...current, ...partial };
  await database.user.updateOne({ userId }, { $set: { options: updated } });
  return updated;
}

export function parseTickersInput(input: string): string[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .slice(0, 2000);
}
