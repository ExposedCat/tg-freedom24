export type Ticker = {
  name: string;
  lastPrice: number;
  lastUpdated?: Date;
  delta?: number;
  theta?: number;
};
