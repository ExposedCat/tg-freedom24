import { type OptionListing, fetchOptions } from '../freedom/orders.js';
import { TradenetWebSocket } from '../freedom/realtime.js';
import type { AnalyzedOption, OptionsSettings } from './types.js';
import { yahooChart3moPeak, yahooChart3y } from '../market-data/yahoo.js';

function logStep(ticker: string, operation: string, result: string): void {
  console.log(`${ticker} ${operation} ${result}`);
}

import { fetchQuarterlyRevenueSec } from '../market-data/sec.js';

async function yahooQuarterlyRevenue(tickerSymbol: string): Promise<number[] | null> {
  const secRevenue = await fetchQuarterlyRevenueSec(tickerSymbol);
  if (secRevenue && secRevenue.length > 0) return secRevenue;
  return null;
}

function computeAnnualizedRevenueGrowth(revenuesAscending: number[]): number | null {
  const totalCount = revenuesAscending.length;
  if (totalCount === 0) return null;
  const takeCount = Math.min(8, totalCount);
  const window = revenuesAscending.slice(-takeCount);
  if (window.length === 0) return null;

  const quarterToQuarterGrowthRatios: number[] = [];
  for (let ratioIndex = 1; ratioIndex < window.length; ratioIndex++) {
    const previousRevenue = window[ratioIndex - 1];
    const currentRevenue = window[ratioIndex];
    if (previousRevenue > 0 && currentRevenue > 0) {
      quarterToQuarterGrowthRatios.push(currentRevenue / previousRevenue);
    }
  }

  if (quarterToQuarterGrowthRatios.length === 0) {
    if (totalCount >= 8) {
      const lastFourQuarterRevenueSum = window
        .slice(-4)
        .reduce((sumOfRevenues, revenueValue) => sumOfRevenues + revenueValue, 0);
      const previousFourQuarterRevenueSum = window
        .slice(-8, -4)
        .reduce((sumOfRevenues, revenueValue) => sumOfRevenues + revenueValue, 0);
      if (lastFourQuarterRevenueSum > 0 && previousFourQuarterRevenueSum > 0) {
        return lastFourQuarterRevenueSum / previousFourQuarterRevenueSum;
      }
    }
    if (totalCount >= 2 && window[window.length - 2] > 0 && window[window.length - 1] > 0) {
      const singleQuarterGrowthRatio = window[window.length - 1] / window[window.length - 2];
      return Math.pow(singleQuarterGrowthRatio, 4);
    }
    return null;
  }

  if (quarterToQuarterGrowthRatios.length === 1) {
    return Math.pow(quarterToQuarterGrowthRatios[0], 4);
  }

  const sumOfLogRatios = quarterToQuarterGrowthRatios.reduce(
    (sumOfLogs, growthRatio) => sumOfLogs + Math.log(growthRatio),
    0,
  );
  const geometricMean = Math.exp(sumOfLogRatios / quarterToQuarterGrowthRatios.length);
  const annualized = Math.pow(geometricMean, 4);

  if (!Number.isFinite(annualized) || annualized <= 0) return null;
  return annualized;
}

function standardNormalCdf(inputValue: number): number {
  return 0.5 * (1 + erf(inputValue / Math.SQRT2));
}

function bsCall(
  spotPrice: number,
  strike: number,
  yearsToExpiry: number,
  riskFree: number,
  volatility: number,
): number {
  if (yearsToExpiry <= 0 || volatility <= 0 || spotPrice <= 0 || strike <= 0) return Math.max(spotPrice - strike, 0);
  const d1Numerator = Math.log(spotPrice / strike) + (riskFree + 0.5 * volatility * volatility) * yearsToExpiry;
  const d1Denominator = volatility * Math.sqrt(yearsToExpiry);
  const d1Value = d1Numerator / d1Denominator;
  const d2Value = d1Value - volatility * Math.sqrt(yearsToExpiry);
  return (
    spotPrice * standardNormalCdf(d1Value) - strike * Math.exp(-riskFree * yearsToExpiry) * standardNormalCdf(d2Value)
  );
}

function bsDelta(
  spotPrice: number,
  strike: number,
  yearsToExpiry: number,
  riskFree: number,
  volatility: number,
): number {
  if (yearsToExpiry <= 0 || volatility <= 0 || spotPrice <= 0 || strike <= 0) return spotPrice > strike ? 1 : 0;
  const d1Numerator = Math.log(spotPrice / strike) + (riskFree + 0.5 * volatility * volatility) * yearsToExpiry;
  const d1Denominator = volatility * Math.sqrt(yearsToExpiry);
  const d1Value = d1Numerator / d1Denominator;
  return standardNormalCdf(d1Value);
}

function erf(inputValue: number): number {
  const coefficientA1 = 0.254829592;
  const coefficientA2 = -0.284496736;
  const coefficientA3 = 1.421413741;
  const coefficientA4 = -1.453152027;
  const coefficientA5 = 1.061405429;
  const pConstant = 0.3275911;
  const signOfInput = inputValue < 0 ? -1 : 1;
  const tValue = 1 / (1 + pConstant * Math.abs(inputValue));
  const erfApproximation =
    1 -
    ((((coefficientA5 * tValue + coefficientA4) * tValue + coefficientA3) * tValue + coefficientA2) * tValue +
      coefficientA1) *
      tValue *
      Math.exp(-inputValue * inputValue);
  return signOfInput * erfApproximation;
}

function makeBaseCode(tickerSymbol: string): string {
  return tickerSymbol.includes('.') ? tickerSymbol : `${tickerSymbol}.US`;
}

async function ltpMapForSymbols(symbols: string[], timeoutMs?: number): Promise<Map<string, number>> {
  if (!symbols.length) return new Map();
  if (!TradenetWebSocket.isConnected()) return new Map();
  const priceMap = await TradenetWebSocket.fetchOptionPrices(symbols, { timeoutMs, requireAll: true });
  return priceMap;
}

async function freedomListCallsByBaseCode(
  apiKey: string,
  secretKey: string,
  baseContractCode: string,
): Promise<
  Array<{
    contractSymbol: string;
    strike: number;
    expirationISO: string;
    multiplier: number;
  }>
> {
  const listings = (await fetchOptions(apiKey, secretKey, baseContractCode, 'FIX')) || [];
  const calls = (listings as OptionListing[]).filter(
    optionListing => optionListing && optionListing.option_type === 'CALL',
  );
  return calls.map(optionListing => ({
    contractSymbol: optionListing.ticker.startsWith('+') ? optionListing.ticker : `+${optionListing.ticker}`,
    strike: Number(optionListing.strike_price),
    expirationISO: optionListing.expire_date,
    multiplier: optionListing.contract_multiplier || 100,
  }));
}

export async function screenTickers(
  tickers: string[],
  settings: OptionsSettings,
): Promise<Array<{ ticker: string; baseCode: string; spot: number; gr: number; S1: number }>> {
  const screened: Array<{ ticker: string; baseCode: string; spot: number; gr: number; S1: number }> = [];
  for (const rawSymbol of tickers.slice(0, settings.maxTickers)) {
    const tickerSymbol = rawSymbol.trim();
    if (!tickerSymbol) continue;
    logStep(tickerSymbol, 'screen/start', '-');

    const chartThreeYears = await yahooChart3y(tickerSymbol);
    if (!chartThreeYears) {
      logStep(tickerSymbol, 'screen/chart3y', 'no_data');
      continue;
    }
    logStep(
      tickerSymbol,
      'screen/chart3y',
      `spot=${chartThreeYears.spot.toFixed(2)} peak=${chartThreeYears.peak.toFixed(2)}`,
    );

    const baseCode = makeBaseCode(tickerSymbol);
    let spotPrice = chartThreeYears.spot;
    logStep(tickerSymbol, 'spot/request', baseCode);
    const baseLtpMap = await ltpMapForSymbols([baseCode], settings.timeout * 1000);
    const liveBaseSpot = baseLtpMap.get(baseCode);
    logStep(tickerSymbol, 'spot/received', `${liveBaseSpot ? 1 : 0}/1`);
    if (!liveBaseSpot || liveBaseSpot <= 0) {
      const alt = baseCode.endsWith('.US') ? baseCode.slice(0, -3) : baseCode;
      if (alt !== baseCode) {
        logStep(tickerSymbol, 'spot/retry', alt);
        const altMap = await ltpMapForSymbols([alt], settings.timeout * 1000);
        const altSpot = altMap.get(alt);
        logStep(tickerSymbol, 'spot/received', `${altSpot ? 1 : 0}/1`);
        if (altSpot && altSpot > 0) spotPrice = altSpot;
      }
    } else {
      spotPrice = liveBaseSpot;
    }
    logStep(tickerSymbol, 'spot/base', spotPrice.toFixed(2));

    const peakRatio = chartThreeYears.peak / spotPrice;
    if (!(peakRatio >= settings.peakThreshold)) {
      logStep(tickerSymbol, 'screen/peak_ratio', `fail ${peakRatio.toFixed(3)}<${settings.peakThreshold.toFixed(3)}`);
      continue;
    }
    logStep(tickerSymbol, 'screen/peak_ratio', `pass ${peakRatio.toFixed(3)}`);

    const threeMonthPeak = await yahooChart3moPeak(tickerSymbol);
    if (!threeMonthPeak) {
      logStep(tickerSymbol, 'screen/3m', 'no_data');
      continue;
    }
    logStep(tickerSymbol, 'screen/3m', threeMonthPeak.toFixed(2));

    const gapOkay = spotPrice <= threeMonthPeak * (1 - settings.peak3mGapPct / 100);
    if (!gapOkay) {
      logStep(
        tickerSymbol,
        'screen/peak3m_gap',
        `fail spot=${spotPrice.toFixed(2)} thr=${Math.round(threeMonthPeak * (1 - settings.peak3mGapPct / 100))}`,
      );
      continue;
    }
    logStep(tickerSymbol, 'screen/peak3m_gap', 'pass');

    const quarterlyRevenues = await yahooQuarterlyRevenue(tickerSymbol);
    if (!quarterlyRevenues) {
      logStep(tickerSymbol, 'revenue/last5', 'none');
      continue;
    }

    const annualizedGrowth = computeAnnualizedRevenueGrowth(quarterlyRevenues);
    if (!annualizedGrowth || annualizedGrowth <= 1.05) {
      logStep(tickerSymbol, 'screen/growth', `fail ${annualizedGrowth ? annualizedGrowth.toFixed(3) : 'NaN'}`);
      continue;
    }
    logStep(tickerSymbol, 'screen/growth', annualizedGrowth.toFixed(3));

    const projectedTarget = spotPrice * annualizedGrowth * settings.optimismRate;
    screened.push({ ticker: tickerSymbol, baseCode, spot: spotPrice, gr: annualizedGrowth, S1: projectedTarget });
    logStep(
      tickerSymbol,
      'screen/selected',
      `base=${baseCode} spot=${spotPrice.toFixed(2)} S1=${projectedTarget.toFixed(2)}`,
    );
  }
  return screened;
}

function createLinearPath(
  startSpotPrice: number,
  targetSpotPrice: number,
  totalDays: number,
  numberOfSteps: number,
): Array<{ day: number; spot: number }> {
  const pathPoints: Array<{ day: number; spot: number }> = [];
  for (let stepIndex = 0; stepIndex < numberOfSteps; stepIndex++) {
    const day = Math.floor((stepIndex * totalDays) / (numberOfSteps - 1));
    const spot = startSpotPrice + (targetSpotPrice - startSpotPrice) * (stepIndex / (numberOfSteps - 1));
    pathPoints.push({ day, spot });
  }
  return pathPoints;
}

export async function analyzeForTicker(
  ticker: string,
  baseCode: string,
  targetSpotPrice: number,
  settings: OptionsSettings,
): Promise<AnalyzedOption[]> {
  logStep(ticker, 'analyze/start', baseCode);

  const freedomCalls = await freedomListCallsByBaseCode(
    process.env.F24_API_KEY || '',
    process.env.F24_SECRET_KEY || '',
    baseCode,
  );
  logStep(ticker, 'analyze/listings', String(freedomCalls.length));
  if (freedomCalls.length > 0) {
    const expirationDates = Array.from(new Set(freedomCalls.map(option => option.expirationISO))).sort();
    logStep(ticker, 'analyze/expirations', JSON.stringify(expirationDates));
  }
  if (!freedomCalls.length) return [];

  logStep(ticker, 'analyze/ws', TradenetWebSocket.isConnected() ? 'connected' : 'disconnected');
  const baseLtpMap = await ltpMapForSymbols([baseCode], settings.timeout * 1000);
  const baseSpot = baseLtpMap.get(baseCode) ?? null;
  logStep(ticker, 'analyze/base_received', `${baseSpot ? 1 : 0}/1`);
  if (!baseSpot || baseSpot <= 0) {
    if (baseCode.endsWith('.US')) {
      const alt = baseCode.slice(0, -3);
      logStep(ticker, 'analyze/base_retry', alt);
      const altMap = await ltpMapForSymbols([alt], settings.timeout * 1000);
      const altSpot = altMap.get(alt) ?? null;
      logStep(ticker, 'analyze/base_received', `${altSpot ? 1 : 0}/1`);
      if (altSpot && altSpot > 0) {
        logStep(ticker, 'analyze/base_spot', altSpot.toFixed(2));
        // continue with alt spot
        return await analyzeForTicker(ticker, alt, targetSpotPrice, settings);
      }
    }
    logStep(ticker, 'analyze/base_spot', 'none');
    return [];
  }
  logStep(ticker, 'analyze/base_spot', baseSpot.toFixed(2));

  const optionSymbols = freedomCalls.map(option => option.contractSymbol);
  logStep(ticker, 'analyze/ltp_request', String(optionSymbols.length));
  logStep(ticker, 'analyze/ltp_wait', `${settings.timeout * 1000}ms all`);
  const optionLtpMap = await ltpMapForSymbols(optionSymbols, settings.timeout * 1000);
  logStep(ticker, 'analyze/ltp_received', `${optionLtpMap.size}/${optionSymbols.length}`);
  logStep(ticker, 'analyze/ltp_options', String(optionLtpMap.size));

  const today = new Date();
  const analyzed: AnalyzedOption[] = [];

  const path = createLinearPath(
    baseSpot,
    targetSpotPrice * settings.optimismRate,
    settings.horizonDays,
    settings.steps,
  );

  for (const option of freedomCalls) {
    const strikeBelowPct = ((baseSpot - option.strike) / baseSpot) * 100;
    if (strikeBelowPct >= settings.noLessStrikePct) {
      logStep(ticker, 'skip/strike_gap', `${option.contractSymbol} ${strikeBelowPct.toFixed(1)}%`);
      continue;
    }
    const liveOptionPrice = optionLtpMap.get(option.contractSymbol) ?? null;
    if (!liveOptionPrice || liveOptionPrice <= 0) {
      logStep(ticker, 'skip/no_ltp', option.contractSymbol);
      continue;
    }
    const midPrice = liveOptionPrice;
    if (!(midPrice <= settings.budget)) {
      logStep(ticker, 'skip/budget', `${option.contractSymbol} ${midPrice.toFixed(2)}`);
      continue;
    }
    const expirationDate = new Date(`${option.expirationISO}T00:00:00Z`);
    if (isNaN(expirationDate.getTime())) {
      logStep(ticker, 'skip/expiration', option.contractSymbol);
      continue;
    }
    const spreadPct = 0.01;
    const ivDecimal = 0.5;
    const yearsToExpiry = Math.max(0, (expirationDate.getTime() - today.getTime()) / (365 * 24 * 3600 * 1000));
    const delta = bsDelta(baseSpot, option.strike, yearsToExpiry, 0, ivDecimal);
    if (!(delta >= settings.deltaMin && delta <= settings.deltaMax)) {
      logStep(ticker, 'skip/delta', `${option.contractSymbol} ${delta.toFixed(3)}`);
      continue;
    }

    const initialCost = midPrice * option.multiplier;
    const outcomes: Array<{
      peakDate: Date;
      peakSpot: number;
      peakOptionAdj: number;
      growth: number;
    }> = [];

    for (const point of path) {
      if (point.day <= 0) continue;
      const peakDate = new Date(today.getTime() + point.day * 24 * 3600 * 1000);
      if (peakDate >= expirationDate) continue;

      const yearsUntilPeak = Math.max(0, (expirationDate.getTime() - peakDate.getTime()) / (365 * 24 * 3600 * 1000));
      const theo = bsCall(point.spot, option.strike, yearsUntilPeak, 0, ivDecimal);
      const theoAdj = Math.max(0, theo * (1 - spreadPct));
      const gross = theoAdj * option.multiplier - initialCost;
      const net = gross - settings.commission;
      const totalReturn = net / initialCost;

      if (totalReturn <= -1) continue;

      const liquidityScore = 1.0;
      const adjustedReturn = totalReturn * liquidityScore;
      const daily = adjustedReturn > -1 ? Math.pow(1 + adjustedReturn, 1 / point.day) - 1 : -1;

      if (Number.isFinite(daily)) {
        outcomes.push({ peakDate, peakSpot: point.spot, peakOptionAdj: theoAdj, growth: daily });
      }
    }

    if (outcomes.length === 0) {
      logStep(ticker, 'skip/no_outcomes', option.contractSymbol);
      continue;
    }

    outcomes.sort((leftOutcome, rightOutcome) => rightOutcome.growth - leftOutcome.growth);
    const conservativeIndex = Math.min(4, outcomes.length - 1);
    const conservative = outcomes[conservativeIndex];

    analyzed.push({
      ticker,
      baseContractCode: baseCode,
      symbol: option.contractSymbol,
      strike: option.strike,
      expiration: option.expirationISO,
      initialPrice: midPrice,
      bid: midPrice,
      ask: midPrice,
      spreadPct,
      iv: ivDecimal,
      delta,
      openInterest: 0,
      volume: 0,
      conservativeDailyGrowth: conservative.growth,
      conservativePeakDate: conservative.peakDate.toISOString().slice(0, 10),
      conservativePeakOptionPrice: Number(conservative.peakOptionAdj.toFixed(2)),
      conservativePeakSpotPrice: Number(conservative.peakSpot.toFixed(2)),
      ltp: liveOptionPrice,
    });
    logStep(ticker, 'pick', `${option.contractSymbol} ${conservative.growth.toFixed(4)}`);
  }
  analyzed.sort((leftOption, rightOption) => rightOption.conservativeDailyGrowth - leftOption.conservativeDailyGrowth);
  logStep(ticker, 'analyze/done', String(analyzed.length));
  return analyzed.slice(0, settings.top);
}
