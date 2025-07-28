import type { Collection } from 'mongodb';

export type User = {
  userId: number;
  apiKey: string;
  secretKey: string;
  sid: string;
};

export type Chat = {
  chatId: number;
  subscriptions?: string[];
};

export type Ticker = {
  name: string;
  lastPrice: number;
};

export type Database = {
  user: Collection<User>;
  chat: Collection<Chat>;
  tickers: Collection<Ticker>;
};
