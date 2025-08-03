import { formatCurrency, formatPercentage, formatTimeFromNow, formatTimeLeft } from '../../services/formatters.js';
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
  const timeFromNow = formatTimeFromNow(position.endDate);
  const strikeChange = position.baseTickerPrice - position.strike;

  return {
    state: profit > 0 ? 'profit' : profit < 0 ? 'loss' : 'zero',
    name: position.name,
    change: formatCurrency(profit),
    percent: formatPercentage(percentage),
    startPrice: position.startPrice.toFixed(0),
    currentPrice: position.currentPrice.toFixed(0),
    baseTickerPrice: position.baseTickerPrice.toFixed(0),
    startDate: position.startDate.toLocaleDateString(),
    endDate: position.endDate.toLocaleDateString(),
    timeLeft,
    timeFromNow,
    strike: formatCurrency(position.strike),
    strikeChange: formatCurrency(strikeChange),
    usingMarketPrice: position.usingMarketPrice,
  };
}
