export type PredictionSettings = {
  peakThreshold3y: number; // param 1
  peakThreshold3m: number; // param 2
  minAnnualRevenueGrowth: number; // param 3
  budget: number; // param 4
  minMonths: number; // param 5
  optimismRate: number; // param 6
  minOpenInterest: number;
  minVolume: number;
  minDelta: number;
  maxSpreadPct: number;
  commission: number; // shown, not configurable by commands
};

export const defaultPredictionSettings: PredictionSettings = {
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
};

export type User = {
  userId: number;
  apiKey: string;
  secretKey: string;
  sid: string;
  predictionSettings?: Partial<PredictionSettings>;
};
