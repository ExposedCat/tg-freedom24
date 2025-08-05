import type { Database } from '../database/types.js';
import { TradenetWebSocket } from '../freedom/realtime.js';

export async function addSubscription(
  database: Database,
  chatId: number,
  ticker: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentSubscriptions = chat?.subscriptions || [];

    if (currentSubscriptions.includes(ticker)) {
      return {
        success: false,
        error: `Already subscribed to ${ticker}`,
      };
    }

    const updatedSubscriptions = [...currentSubscriptions, ticker];

    await database.chat.updateOne({ chatId }, { $set: { subscriptions: updatedSubscriptions } }, { upsert: true });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Successfully subscribed to ${ticker}`,
    };
  } catch (error) {
    console.error('Error subscribing to ticker:', error);
    return {
      success: false,
      error: `Failed to subscribe to ${ticker}`,
    };
  }
}

export async function removeSubscription(
  database: Database,
  chatId: number,
  index: number,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const currentSubscriptions = chat?.subscriptions || [];

    if (index < 0 || index >= currentSubscriptions.length) {
      return {
        success: false,
        error: 'Invalid subscription index',
      };
    }

    const ticker = currentSubscriptions[index];
    const updatedSubscriptions = currentSubscriptions.filter((_: string, i: number) => i !== index);

    await database.chat.updateOne({ chatId }, { $set: { subscriptions: updatedSubscriptions } });

    await TradenetWebSocket.refreshAllSubscriptions();

    return {
      success: true,
      message: `Successfully unsubscribed from ${ticker}`,
    };
  } catch (error) {
    console.error('Error unsubscribing from ticker:', error);
    return {
      success: false,
      error: 'Failed to unsubscribe',
    };
  }
}

export async function listSubscriptions(
  database: Database,
  chatId: number,
): Promise<{
  subscriptions: string[];
  priceMap: Map<string, number>;
}> {
  try {
    const chat = await database.chat.findOne({ chatId });
    const subscriptions = chat?.subscriptions || [];

    const tickers = await database.tickers
      .find({
        name: { $in: subscriptions },
      })
      .toArray();

    const priceMap = new Map(tickers.map(t => [t.name, t.lastPrice]));

    return { subscriptions, priceMap };
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return { subscriptions: [], priceMap: new Map() };
  }
}
