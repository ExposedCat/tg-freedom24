export type Freedom24PortfolioResponse = {
  result: {
    ps: {
      loaded: boolean;
      acc: AccountCurrency[];
      pos: PortfolioPosition[];
      key: string;
    };
  };
};

export type AccountCurrency = {
  sql_signal_tm: string;
  currval: number;
  curr: string;
  t: number;
  sql_exec_tm: string;
  k: number;
  forecast_in: number;
  forecast_out: number;
  t2_in: number;
  t2_out: number;
  s: number;
};

export type PortfolioPosition = {
  sql_signal_tm: string;
  mkt_price: number;
  vm: number;
  profit_close: number;
  acc_pos_id: number;
  accruedint_a: number;
  open_bal: number;
  go: number;
  bal_price_a: number;
  price_a: number;
  face_val_a: number;
  instr_id: number;
  /** API field name is `Yield` */
  Yield: number;
  profit_price: number;
  market_value: number;
  currval: number;
  q: number;
  curr: string;
  t: number;
  close_price: number;
  mkt_id: number;
  sql_exec_tm: string;
  k: number;
  maturity_d: string;
  base_currency: string;
  issue_nb: string;
  name: string;
  name2: string;
  scheme_calc: string;
  ltr: string;
  acd: number;
  fv: number;
  base_contract_code: string;
  s: number;
  i: string;
};
