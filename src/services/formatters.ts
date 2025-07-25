export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded > 0) {
    return `+$${rounded}`;
  } else if (rounded < 0) {
    return `-$${Math.abs(rounded)}`;
  } else {
    return '$0';
  }
}

export function formatPercentage(percentage: number): string {
  const rounded = Math.round(percentage);
  if (rounded > 0) {
    return `+${rounded}%`;
  } else if (rounded < 0) {
    return `${rounded}%`;
  } else {
    return '0%';
  }
}

export function formatTimeLeft(startDate: Date, endDate: Date): string {
  let diff = endDate.getTime() - startDate.getTime();
  if (diff <= 0) return 'now';

  const units = [
    { label: 'y', ms: 1000 * 60 * 60 * 24 * 365 },
    { label: 'm', ms: 1000 * 60 * 60 * 24 * 30 },
    { label: 'd', ms: 1000 * 60 * 60 * 24 },
    { label: 'h', ms: 1000 * 60 * 60 },
    { label: 'm', ms: 1000 * 60 },
  ];

  const result: string[] = [];
  let unitsUsed = 0;

  for (const unit of units) {
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

export function getMarketState(): 'pre' | 'open' | 'post' | 'closed' {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  if (h < 10) return 'closed';
  if (h < 15 || (h === 15 && m < 30)) return 'pre';
  if (h < 22) return 'open';
  return 'post';
}
