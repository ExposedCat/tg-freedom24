import fetch from 'node-fetch';

type SecUnitEntry = {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number | string;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

type SecCompanyConcept = {
  cik?: number | string;
  taxonomy?: string;
  tag?: string;
  label?: string;
  description?: string;
  entityName?: string;
  units?: Record<string, SecUnitEntry[]>;
};

function isCompanyConcept(value: unknown): value is SecCompanyConcept {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (!record.units || typeof record.units !== 'object') return false;
  return true;
}

function parseDate(value: string | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function deriveQuarterKey(entry: SecUnitEntry): string | null {
  if (entry.frame && /^CY\d{4}Q[1-4]$/.test(entry.frame)) return entry.frame;
  const endTs = parseDate(entry.end);
  if (!endTs) return null;
  const endDate = new Date(endTs);
  const year = endDate.getUTCFullYear();
  const month = endDate.getUTCMonth() + 1;
  const quarter = Math.min(4, Math.max(1, Math.ceil(month / 3)));
  return `CY${year}Q${quarter}`;
}

function isQuarterly(entry: SecUnitEntry): boolean {
  if (entry.form === '10-Q') return true;
  if (entry.fp && /^Q[1-4]$/.test(entry.fp)) return true;
  if (entry.frame && /^CY\d{4}Q[1-4]$/.test(entry.frame)) return true;
  const startTs = parseDate(entry.start);
  const endTs = parseDate(entry.end);
  if (!startTs || !endTs) return false;
  const days = Math.abs(endTs - startTs) / (24 * 3600 * 1000);
  return days >= 80 && days <= 100;
}

async function resolveCik(symbol: string, userAgent: string): Promise<string | null> {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?CIK=${encodeURIComponent(symbol)}&owner=exclude&action=getcompany`;
  const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/CIK=([0-9]{10})/);
  return match ? match[1] : null;
}

export async function fetchQuarterlyRevenueSec(tickerSymbol: string): Promise<number[] | null> {
  const symbol = tickerSymbol.endsWith('.US') ? tickerSymbol.slice(0, -3) : tickerSymbol;
  const userAgent = process.env.SEC_USER_AGENT || '';
  if (!userAgent) return null;
  try {
    const cik = await resolveCik(symbol, userAgent);
    if (!cik) return null;
    const tags: string[] = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'Revenues'];
    for (const tag of tags) {
      const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
      const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
      if (!response.ok) continue;
      const rawText = await response.text();
      const payload = JSON.parse(rawText) as unknown;
      if (!isCompanyConcept(payload)) continue;
      const usdEntries = payload.units?.USD ?? [];
      if (!Array.isArray(usdEntries) || usdEntries.length === 0) continue;
      const quarterlyEntries = usdEntries.filter(isQuarterly);
      if (quarterlyEntries.length === 0) continue;
      const latestByQuarter = new Map<string, SecUnitEntry>();
      for (const entry of quarterlyEntries) {
        if (typeof entry.val !== 'number' || !(entry.val > 0)) continue;
        const quarterKey = deriveQuarterKey(entry);
        if (!quarterKey) continue;
        const existing = latestByQuarter.get(quarterKey);
        if (!existing || parseDate(entry.filed) > parseDate(existing.filed)) {
          latestByQuarter.set(quarterKey, entry);
        }
      }
      if (latestByQuarter.size === 0) continue;
      const sorted = Array.from(latestByQuarter.values()).sort(
        (left, right) => parseDate(left.end) - parseDate(right.end),
      );
      const lastFive = sorted.slice(-5);
      if (lastFive.length === 0) return null;
      return lastFive.map(e => e.val as number);
    }
    return null;
  } catch {
    return null;
  }
}
