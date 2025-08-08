import { describe, it, expect } from 'vitest';
import { buildPredictionSummary } from '../src/modules/prediction/controller.js';

describe('Prediction message formatting', () => {
  // Telegram HTML doesn't allow stray '<' or '&' without tags; our builder only includes
  // <b> tags and plain text. This simple check ensures we don't introduce other tags.
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

    expect(msg.includes('<b>')).toBe(true);
    expect(msg.includes('</b>')).toBe(true);
    expect(msg.includes('≥')).toBe(true);
    expect(msg.includes('≤')).toBe(true);
    // Make sure we didn't include accidental '=' tag: <=> etc.
    expect(/<[^b/]/.test(msg)).toBe(false);
  });
});
