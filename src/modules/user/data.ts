import type { Database } from '../database/types.js';
import type { User } from './types.js';

export type ServiceResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type UserCredentials = {
  apiKey: string;
  secretKey: string;
  login: string;
  password: string;
};

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

export async function findUserById(database: Database, userId: number): Promise<User | null> {
  return await database.user.findOne({ userId });
}

export async function updateUserPredictionSettings(
  database: Database,
  userId: number,
  partial: Partial<User['predictionSettings']>,
): Promise<User | null> {
  await database.user.updateOne({ userId }, { $set: { predictionSettings: partial } }, { upsert: true });
  return await findUserById(database, userId);
}

export async function createOrUpdateUser(
  database: Database,
  userId: number,
  credentials: UserCredentials,
): Promise<ServiceResult<User>> {
  const auth = await authenticateWithTradernet(credentials.login, credentials.password);

  if (auth.error) {
    return { success: false, error: auth.error };
  }

  const existingUser = await findUserById(database, userId);
  const userData = { userId, apiKey: credentials.apiKey, secretKey: credentials.secretKey, sid: auth.SID! } as User;

  try {
    if (existingUser) {
      await database.user.updateOne(
        { userId },
        {
          $set: {
            apiKey: credentials.apiKey,
            secretKey: credentials.secretKey,
            sid: auth.SID!,
          },
        },
      );
    } else {
      await database.user.insertOne(userData);
    }

    return { success: true, data: userData };
  } catch {
    return { success: false, error: 'Failed to save user data' };
  }
}
