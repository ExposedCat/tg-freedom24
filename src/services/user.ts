import type { Database, User } from '../types/database.js';

async function authenticateWithTradernet(login: string, password: string): Promise<{ SID?: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('login', login);
    formData.append('password', password);

    const response = await fetch('https://tradernet.com/api/check-login-password', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.SID) {
      return { SID: result.SID };
    } else {
      return { error: result.error || 'Authentication failed' };
    }
  } catch {
    return { error: 'Network error during authentication' };
  }
}

export async function createUser(args: {
  db: Database;
  userId: number;
  apiKey: string;
  secretKey: string;
  login: string;
  password: string;
}): Promise<{ user?: User; error?: string }> {
  const auth = await authenticateWithTradernet(args.login, args.password);

  if (auth.error) {
    return { error: auth.error };
  }

  const userObject = {
    userId: args.userId,
    apiKey: args.apiKey,
    secretKey: args.secretKey,
    sid: auth.SID!,
  } as User;

  await args.db.user.insertOne(userObject);

  return { user: userObject };
}

export async function updateUser(args: {
  db: Database;
  userId: number;
  apiKey: string;
  secretKey: string;
  login: string;
  password: string;
}): Promise<{ error?: string }> {
  const auth = await authenticateWithTradernet(args.login, args.password);

  if (auth.error) {
    return { error: auth.error };
  }

  await args.db.user.updateOne(
    { userId: args.userId },
    {
      $set: {
        apiKey: args.apiKey,
        secretKey: args.secretKey,
        sid: auth.SID!,
      },
    },
  );

  return {};
}

export async function getUser(args: { db: Database; userId: number }): Promise<User | null> {
  const user = await args.db.user.findOne({ userId: args.userId });
  return user;
}
