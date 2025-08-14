export function getMarketState(): 'pre' | 'open' | 'post' | 'closed' {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 10) return 'closed';
  if (h < 15 || (h === 15 && m < 30)) return 'pre';
  if (h < 22) return 'open';
  return 'post';
}

export function getTimeLeftForCurrentMarketState(now: Date = new Date()): string {
  const state = getMarketState();

  const next = new Date(now);
  if (state === 'closed') {
    next.setHours(10, 0, 0, 0);
  } else if (state === 'pre') {
    next.setHours(15, 30, 0, 0);
  } else if (state === 'open') {
    next.setHours(22, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
  }

  let diff = next.getTime() - now.getTime();
  if (diff < 0) diff = 0;

  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const minutesPadded = minutes.toString().padStart(2, '0');
  return `${hours}:${minutesPadded}`;
}

export function getMarketEmoji(state: 'pre' | 'open' | 'post' | 'closed' = getMarketState()): string {
  if (state === 'closed') return '📓';
  if (state === 'pre') return '📙';
  if (state === 'open') return '📗';
  return '📘';
}
