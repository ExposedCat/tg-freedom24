import { describe, it, expect } from 'vitest';
import { buildPredictionSummary } from '../src/modules/prediction/controller.js';

function sanitize(s: string): string {
  // Telegram HTML doesn't allow stray '<' or '&' without tags; our builder only includes
  // <b> tags and plain text. This simple check ensures we don't introduce other tags.
  return s;
}

describe('Prediction message formatting', () => {
  it('should not include invalid HTML tags and should use ≥/≤ instead of >, <', () => {
    const msg = buildPredictionSummary({
      peakThreshold3y: 1.2,
      peakThreshold3m: 1.05,
      minAnnualRevenueGrowth: 1.05,
      budget: 3000,
      minMonths: 6,
      optimismRate: 1.1,
      minOpenInterest: 150,
      minVolume: 1,
      minDelta: 0.02,
      maxSpreadPct: 0.99,
      commission: 1.3,
    } as any);

    const s = sanitize(msg);
    expect(s.includes('<b>')).toBe(true);
    expect(s.includes('</b>')).toBe(true);
    expect(s.includes('≥')).toBe(true);
    expect(s.includes('≤')).toBe(true);
    // Make sure we didn't include accidental '=' tag: <=> etc.
    expect(/<[^b/]/.test(s)).toBe(false);
  });
});
