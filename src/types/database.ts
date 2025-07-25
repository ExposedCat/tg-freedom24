import type { Collection } from 'mongodb';

export type User = {
  userId: number;
  login: string;
  password: string;
}

export type Database = {
  user: Collection<User>;
}
