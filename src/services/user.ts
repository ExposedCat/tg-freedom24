import type { Database, User } from '../types/database.js';

export async function createUser(args: {
  db: Database;
  userId: number;
  login: string;
  password: string;
}): Promise<User> {
  const userObject = {
    userId: args.userId,
    login: args.login,
    password: args.password,
  } as User;

  await args.db.user.insertOne(userObject);

  return userObject;
}

export async function updateUser(args: {
  db: Database;
  userId: number;
  login: string;
  password: string;
}): Promise<void> {
  await args.db.user.updateOne(
    { userId: args.userId },
    {
      $set: {
        login: args.login,
        password: args.password,
      },
    },
  );
}

export async function getUser(args: { db: Database; userId: number }): Promise<User | null> {
  const user = await args.db.user.findOne({ userId: args.userId });
  return user;
}
