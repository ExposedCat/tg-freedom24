export type User = {
  userId: number;
  apiKey: string;
  secretKey: string;
  sid: string;
  options?: {
    tickers: string[];
    budget: number;
    minMonths: number;
    top: number;
    maxTickers: number;
    commission: number;
    steps: number;
    horizonDays: number;
    peakThreshold: number;
    peak3mGapPct: number;
    minOi: number;
    minVol: number;
    deltaMin: number;
    deltaMax: number;
    maxSpreadPct: number;
    sleepBase: number;
    timeout: number;
    concurrencyGlobal: number;
    concurrencyExp: number;
    optimismRate: number;
  };
};
