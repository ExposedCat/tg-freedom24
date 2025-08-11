export type OptionsSettings = {
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
  noLessStrikePct: number;
};

export type OptionContractLite = {
  ticker: string;
  baseContractCode: string;
  expireDate: string;
  strike: number;
  type: 'CALL' | 'PUT';
};

export type ChainQuote = {
  strike: number;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  openInterest: number | null;
  volume: number | null;
  impliedVolatility: number | null;
};

export type AnalyzedOption = {
  ticker: string;
  baseContractCode: string;
  symbol: string;
  strike: number;
  expiration: string;
  initialPrice: number;
  bid: number;
  ask: number;
  spreadPct: number;
  iv: number;
  delta: number;
  openInterest: number;
  volume: number;
  conservativeDailyGrowth: number;
  conservativePeakDate?: string;
  conservativePeakOptionPrice?: number;
  conservativePeakSpotPrice?: number;
  ltp?: number;
};
