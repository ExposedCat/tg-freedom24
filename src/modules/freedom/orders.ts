import { makeApiRequest } from './api.js';

export type OrderHistoryResponse = {
  orders: {
    order: Array<{
      instr: string;
      date: string;
      oper?: number;
      p?: number;
      q?: number;
      base_contract_code?: string;
      stat?: number;
      trade?: Array<{
        p: number;
        q: number;
        v: number;
        profit: number;
        date: string;
      }>;
      [key: string]: any;
    }>;
  };
};

export type OptionListing = {
  ticker: string;
  base_contract_code: string;
  last_trade_date: string;
  expire_date: string;
  strike_price: string;
  option_type: 'CALL' | 'PUT' | string;
  need_to_quanthuse_subscribe: boolean;
  contract_multiplier: number;
};

export type OptionsResponse = OptionListing[];

export async function fetchOrdersHistory(
  apiKey: string,
  secretKey: string,
  fromDate: Date,
  toDate: Date,
): Promise<OrderHistoryResponse | null> {
  const from = fromDate.toISOString();
  const to = toDate.toISOString();

  return makeApiRequest<OrderHistoryResponse>(apiKey, secretKey, 'getOrdersHistory', { from, to });
}

export async function fetchOptions(
  apiKey: string,
  secretKey: string,
  baseContractCode: string,
  ltr: string = 'FIX',
): Promise<OptionsResponse | null> {
  return makeApiRequest<OptionsResponse>(
    apiKey,
    secretKey,
    'getOptionsByMktNameAndBaseAsset',
    {
      ltr,
      base_contract_code: baseContractCode,
    },
    'v1',
  );
}
