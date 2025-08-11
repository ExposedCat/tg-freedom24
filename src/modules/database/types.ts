import type { Collection } from 'mongodb';
import type { Chat } from '../chat/types.js';
import type { Ticker } from '../ticker/types.js';
import type { User } from '../user/types.js';

export type Database = {
  user: Collection<User>;
  chat: Collection<Chat>;
  tickers: Collection<Ticker>;
};
