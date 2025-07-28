import type { Collection } from 'mongodb';

export type User = {
  userId: number;
  apiKey: string;
  secretKey: string;
  sid: string;
};

export type Notification = {
  ticker: string;
  direction: '>' | '<';
  price: number;
  lastNotified: Date | null;
  bounceDetected: boolean;
};

export type Chat = {
  chatId: number;
  subscriptions?: string[];
  notifications?: Notification[];
};

export type Ticker = {
  name: string;
  lastPrice: number;
  lastUpdated?: Date;
};

export type Database = {
  user: Collection<User>;
  chat: Collection<Chat>;
  tickers: Collection<Ticker>;
};
