import type { Notification } from '../chat/types.js';

export function shouldTriggerNotification(notification: Notification, currentPrice: number): boolean {
  if (notification.direction === '>' && currentPrice >= notification.price) {
    return true;
  }
  if (notification.direction === '<' && currentPrice < notification.price) {
    return true;
  }
  return false;
}

export function canSendNotification(notification: Notification): boolean {
  if (!notification.lastNotified) return true;

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const lastNotified = new Date(notification.lastNotified);

  return lastNotified < fiveMinutesAgo && notification.bounceDetected;
}

export function shouldDetectBounce(notification: Notification, currentPrice: number): boolean {
  if (!notification.lastNotified || notification.bounceDetected) return false;

  if (notification.direction === '>' && currentPrice <= notification.price) {
    return true;
  }
  if (notification.direction === '<' && currentPrice >= notification.price) {
    return true;
  }
  return false;
}
