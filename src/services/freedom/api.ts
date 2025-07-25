import { createHmac } from 'node:crypto';
import type { Freedom24PortfolioResponse } from './types.js';

export type Option = {
  name: string;
  startDate: Date;
  endDate: Date;
  startPrice: number;
  currentPrice: number;
  strike: number;
};

export type Cash = {
  name: string;
  amount: number;
};

export type UserPortfolio = {
  cash: Cash[];
  positions: Option[];
  total: number;
};

export type PortfolioResponse = {
  error: null | string;
} & UserPortfolio;

export async function fetchPortfolio(apiKey: string, secretKey: string): Promise<PortfolioResponse> {
  const cmd = 'getPositionJson';
  const nonce = Date.now().toString();
  const params = new URLSearchParams({ apiKey, cmd, nonce }).toString();

  const signature = createHmac('sha256', secretKey).update(params).digest('hex');

  try {
    const res = await fetch(`https://tradernet.com/api/v2/cmd/${cmd}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-NtApi-PublicKey': apiKey,
        'X-NtApi-Sig': signature,
      },
      body: params,
    });

    if (!res.ok) {
      return { error: await res.text(), cash: [], positions: [], total: 0 };
    }

    const response: Freedom24PortfolioResponse = await res.json();

    const portfolio: UserPortfolio = {
      cash: response.result.ps.acc.map(acc => ({
        name: acc.curr,
        amount: acc.s,
      })),
      positions: response.result.ps.pos.map(pos => ({
        name: pos.base_contract_code,
        startDate: new Date(0), // FIXME:
        endDate: new Date(pos.maturity_d),
        startPrice: pos.price_a * 100,
        currentPrice: pos.market_value,
        strike: Number(pos.i.split('C').at(-1)),
      })),
      total: response.result.ps.pos.reduce(
        (total, position) => total + position.market_value - position.price_a * 100,
        0,
      ),
    };

    return { error: null, ...portfolio };
  } catch (error) {
    console.error(error);
    return { error: 'internal error', cash: [], positions: [], total: 0 };
  }
}
