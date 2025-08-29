export type Ticker = {
  name: string;
  lastPrice: number;
  lastUpdated?: Date;
  delta?: number;
  theta?: number;
  closePrice?: number;
  lastPriceOpen?: number;
  lastPricePost?: number;
  lastPricePre?: number;
};
