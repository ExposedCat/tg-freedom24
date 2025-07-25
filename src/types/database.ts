import type { Collection } from 'mongodb';

export type User = {
  userId: number;
  apiKey: string;
  secretKey: string;
  sid: string;
};

export type Ticker = {
  name: string;
  lastPrice: number;
};

export type Database = {
  user: Collection<User>;
  tickers: Collection<Ticker>;
};
