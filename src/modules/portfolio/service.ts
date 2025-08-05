import { formatMoneyChange, formatPercentageChange, formatTimeLeft } from '../utils/formatting.js';
import type { Option } from '../freedom/portfolio.js';

export type ProcessedPosition = {
  state: string;
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
  usingMarketPrice: boolean;
};

export function processPosition(position: Option): ProcessedPosition {
  const profit = position.currentPrice - position.startPrice;
  const percentage = position.startPrice !== 0 ? (profit / position.startPrice) * 100 : 0;
  const timeLeft = formatTimeLeft(position.startDate, position.endDate);
  const timeFromNow = formatTimeLeft(new Date(), position.endDate);
  const strikeChange = position.baseTickerPrice - position.strike;

  return {
    state: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'zero',
    name: position.name,
    change: formatMoneyChange(profit),
    percent: formatPercentageChange(percentage),
    startPrice: position.startPrice.toFixed(0),
    currentPrice: position.currentPrice.toFixed(0),
    baseTickerPrice: position.baseTickerPrice.toFixed(0),
    startDate: position.startDate.toLocaleDateString(),
    endDate: position.endDate.toLocaleDateString(),
    timeLeft,
    timeFromNow,
    strike: formatMoneyChange(position.strike),
    strikeChange: formatMoneyChange(strikeChange),
    usingMarketPrice: position.usingMarketPrice,
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
