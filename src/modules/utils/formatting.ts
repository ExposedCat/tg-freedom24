const UNITS = [
  { label: 'y', ms: 1000 * 60 * 60 * 24 * 365 },
  { label: 'm', ms: 1000 * 60 * 60 * 24 * 30 },
  { label: 'd', ms: 1000 * 60 * 60 * 24 },
  { label: 'h', ms: 1000 * 60 * 60 },
  { label: 'm', ms: 1000 * 60 },
];

export function formatPrice(amount: number, places = 2): string {
  return `$${formatPlain(amount, places)}`;
}

export function formatMoneyChange(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  const formatted = formatPlain(absolute, 2);
  return `${sign}$${formatted}`;
}

export function formatPercentageChange(percentage: number, places = 0): string {
  const sign = percentage > 0 ? '+' : '';
  return `${sign}${percentage.toFixed(places)}%`;
}

export function formatTimeLeft(startDate: Date, endDate: Date): string {
  let diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) return 'now';

  const result: string[] = [];
  let unitsUsed = 0;

  for (const unit of UNITS) {
    if (unitsUsed >= 2) break;
    const value = Math.floor(diff / unit.ms);
    if (value > 0) {
      result.push(`${value}${unit.label}`);
      diff -= value * unit.ms;
      unitsUsed++;
    }
  }

  return result.length > 0 ? result.join(' ') : 'now';
}

function formatPlain(amount: number, places = 2): string {
  return amount.toFixed(places).replace(/\.00$/, '');
}
