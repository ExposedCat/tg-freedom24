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
  market?: string[];
};
