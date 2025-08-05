export function getMarketState(): 'pre' | 'open' | 'post' | 'closed' {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 10) return 'closed';
  if (h < 15 || (h === 15 && m < 30)) return 'pre';
  if (h < 22) return 'open';
  return 'post';
}
