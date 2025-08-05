export type Trade = {
  ticker: string;
  buyDate: Date;
  sellDate: Date;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  profit: number;
  percentage: number;
};

export type OpenPosition = {
  ticker: string;
  instrumentName: string;
  buyDate: Date;
  buyPrice: number;
  quantity: number;
  currentValue: number;
};

export type ProcessedTradeHistory = {
  trades: Trade[];
  openPositions: OpenPosition[];
};

export type TradeStatistics = {
  finishedProfit: number;
  finishedInvested: number;
  finishedPercentage: number;
};

export type TickerSummary = {
  profit: number;
  currentProfit: number;
  trades: Trade[];
  openPositions: OpenPosition[];
};

export type HistoryEntry = {
  ticker: string;
  profit: number;
  state: string;
  isOpen: boolean;
  summary: TickerSummary;
};
