import type { Option } from '../freedom/portfolio.js';
import { formatMoneyChange, formatPercentageChange, formatPrice, formatTimeLeft } from '../utils/formatting.js';

export type ProcessedPosition = {
  state: string;
  ticker: string;
  name: string;
  change: string;
  percent: string;
  startPrice: string;
  currentPrice: string;
  baseTickerPrice: string;
  startDate: string;
  endDate: string;
  timeLeft: string;
  timeFromNow: string;
  strike: string;
  strikeChange: string;
  breakEven: string;
  breakEvenChange: string;
  usingMarketPrice: boolean;
  greeks: string;
  openOrder?: string;
};

export function processPosition(position: Option): ProcessedPosition {
  const profit = position.currentPrice - position.startPrice;
  const percentage = position.startPrice !== 0 ? (profit / position.startPrice) * 100 : 0;
  const timeLeft = formatTimeLeft(position.startDate, position.endDate);
  const timeFromNow = formatTimeLeft(new Date(), position.endDate);
  const strikeChange = position.baseTickerPrice - position.strike;
  const breakEvenUnderlying =
    position.type === 'put' ? position.strike - position.entryUnitPrice : position.strike + position.entryUnitPrice;
  const breakEvenChange = position.baseTickerPrice - breakEvenUnderlying;
  const greeksParts: string[] = [];
  const formatScaledGreek = (value: number, unit: string): string => {
    let scale = 1;
    let displayed = value * scale;
    while (value !== 0 && Math.abs(displayed) < 0.005 && scale < 100) {
      scale *= 10;
      displayed = value * scale;
    }
    const scaleLabel = scale === 1 ? '+1' : `+${scale}`;
    return `${scaleLabel}${unit} → ${formatPrice(displayed)}`;
  };
  if (typeof position.delta === 'number') greeksParts.push(formatScaledGreek(position.delta, '$'));
  if (typeof position.theta === 'number') greeksParts.push(formatScaledGreek(position.theta, 'd'));
  const greeks = greeksParts.join('\n');

  let openOrder: string | undefined;
  if (typeof position.openOrderPrice === 'number' && typeof position.openOrderTotal === 'number') {
    const projectedProfit = position.openOrderTotal - position.startPrice;
    openOrder = `💰 ${formatPrice(position.openOrderTotal)} ${formatMoneyChange(projectedProfit)}`;
  }

  return {
    state: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'zero',
    ticker: position.ticker,
    name: position.name,
    change: formatMoneyChange(profit),
    percent: formatPercentageChange(percentage),
    startPrice: position.startPrice.toFixed(0),
    currentPrice: position.currentPrice.toFixed(0),
    baseTickerPrice: position.baseTickerPrice.toFixed(2),
    startDate: position.startDate.toLocaleDateString(),
    endDate: position.endDate.toLocaleDateString(),
    timeLeft,
    timeFromNow,
    strike: formatMoneyChange(position.strike),
    strikeChange: formatMoneyChange(strikeChange),
    breakEven: formatMoneyChange(breakEvenUnderlying),
    breakEvenChange: formatMoneyChange(breakEvenChange),
    usingMarketPrice: position.usingMarketPrice,
    greeks,
    openOrder,
  };
}

export function getPortfolioState(percentage: number): string {
  if (percentage === 0) return 'nothing';
  if (percentage >= 50) return 'huge_gain';
  if (percentage >= 20) return 'moderate_gain';
  if (percentage > 0) return 'small_gain';
  if (percentage < -50) return 'significant_loss';
  if (percentage < -20) return 'moderate_loss';
  if (percentage < -5) return 'small_loss';
  return 'significant_loss';
}
