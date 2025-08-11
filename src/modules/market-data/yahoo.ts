import yahooFinance from 'yahoo-finance2';

yahooFinance.suppressNotices(['yahooSurvey']);

function toYahooSymbol(symbol: string): string {
  if (symbol.endsWith('.US')) return symbol.slice(0, -3);
  return symbol;
}

async function chartSpotAndPeak(
  tickerSymbol: string,
  range: '3y' | '3mo',
): Promise<number | null | { spot: number; peak: number }> {
  const yahooSymbol = toYahooSymbol(tickerSymbol);
  try {
    const nowDate = new Date();
    const periodStart = new Date(nowDate);
    if (range === '3y') {
      periodStart.setFullYear(periodStart.getFullYear() - 3);
    } else {
      periodStart.setMonth(periodStart.getMonth() - 3);
    }
    const chartResponse = await yahooFinance.chart(
      yahooSymbol,
      { period1: periodStart, interval: '1d' },
      { validateResult: false },
    );
    const closePrices = (chartResponse.quotes ?? [])
      .map((quote: { close?: number | null }) => (typeof quote.close === 'number' ? quote.close : null))
      .filter((price: number | null): price is number => typeof price === 'number');
    if (!closePrices.length) return range === '3mo' ? null : { spot: 0, peak: 0 };
    if (range === '3mo') {
      let threeMonthPeak = 0;
      for (const price of closePrices) if (price > threeMonthPeak) threeMonthPeak = price;
      return threeMonthPeak;
    }
    const spotPrice = closePrices[closePrices.length - 1];
    let allTimePeak = 0;
    for (const price of closePrices) if (price > allTimePeak) allTimePeak = price;
    return { spot: spotPrice, peak: allTimePeak };
  } catch (error) {
    console.error(`yahoo chart failed for ${tickerSymbol} (${range}):`, error);
    return range === '3mo' ? null : { spot: 0, peak: 0 };
  }
}

export async function yahooChart3y(tickerSymbol: string): Promise<{ spot: number; peak: number } | null> {
  const result = await chartSpotAndPeak(tickerSymbol, '3y');
  if (!result || typeof result === 'number') return null;
  return result;
}

export async function yahooChart3moPeak(tickerSymbol: string): Promise<number | null> {
  const result = await chartSpotAndPeak(tickerSymbol, '3mo');
  if (result && typeof result === 'number') return result;
  return null;
}
