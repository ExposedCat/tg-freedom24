export type PredictionRunState = 'idle' | 'running' | 'done' | 'error';

export type PredictionProgress = {
  status: PredictionRunState;
  processedTickers: number;
  totalTickers: number;
  currentTicker?: string;
  message?: string;
  lastUpdated: Date;
};

export type PredictionResultItem = {
  name: string; // option ticker like +IBM.17OCT2025.C280
  ticker: string;
  strike: number;
  expiration: string;
  initialPrice: number;
  bid: number;
  ask: number;
  iv: number;
  delta: number;
  spreadPct: number;
  conservativeDailyGrowth: number;
  conservativePeakDate: string;
  conservativePeakSpot: number;
  conservativePeakOptionAdj: number;
  openInterest: number;
  volume: number;
};

export type OptionSnapshot = {
  c: string; // ticker, e.g. +IBM.17OCT2025.C280
  bbp: number; // bid price per 1 contract unit
  bap: number; // ask price per 1 contract unit
  bbs?: number;
  bas?: number;
  delta?: number;
  implied_volatility?: number;
  contract_multiplier?: number; // default 100
  base_contract_code?: string; // underlying like IBM.US
};
