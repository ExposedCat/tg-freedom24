import { getPortfolioState } from '../portfolio/service.js';
import { formatMoneyChange, formatPercentageChange } from '../utils/formatting.js';
import type { TickerSummary, TradeStatistics } from './types.js';

export type OpenPosition = {
  ticker: string;
  instrumentName: string;
  buyDate: Date;
  buyPrice: number;
  quantity: number;
  currentValue: number;
};

export function generateTotalsText(
  openPositions: OpenPosition[],
  tickerSummary: Map<string, TickerSummary>,
  statistics: TradeStatistics,
  i18nT: (key: string, params?: any) => string,
): string {
  if (openPositions.length > 0) {
    const totalCurrentProfit = Array.from(tickerSummary.values()).reduce((sum, s) => sum + s.currentProfit, 0);
    const totalOpenInvested = openPositions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalCurrentInvested = statistics.finishedInvested + totalOpenInvested;
    const currentPercentage = totalCurrentInvested !== 0 ? (totalCurrentProfit / totalCurrentInvested) * 100 : 0;

    const worstCaseProfit = statistics.finishedProfit - totalOpenInvested;
    const worstCasePercentage = totalCurrentInvested !== 0 ? (worstCaseProfit / totalCurrentInvested) * 100 : 0;

    const currentState = getPortfolioState(currentPercentage);

    let totalsText = i18nT('history.part.total_line', {
      state: i18nT(`portfolio.icon.state.${currentState}`),
      profit: formatMoneyChange(totalCurrentProfit),
      percentage: formatPercentageChange(currentPercentage),
    });

    totalsText += `\n${formatMoneyChange(worstCaseProfit)} ${formatPercentageChange(worstCasePercentage)}, ${formatMoneyChange(statistics.finishedProfit)} ${formatPercentageChange(statistics.finishedPercentage)}`;

    return totalsText;
  } else {
    const finishedState = getPortfolioState(statistics.finishedPercentage);
    return i18nT('history.part.total_line', {
      state: i18nT(`portfolio.icon.state.${finishedState}`),
      profit: formatMoneyChange(statistics.finishedProfit),
      percentage: formatPercentageChange(statistics.finishedPercentage),
    });
  }
}
