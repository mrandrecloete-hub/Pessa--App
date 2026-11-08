import { dec } from '../money/money';
import { signedAmount } from './ledger';
import type { Transaction } from './types';

export interface SeriesPoint {
  date: string;
  balance: string;
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * End-of-day total balance for every day from `from` to `to` (inclusive), built only from
 * SETTLED transactions in the base currency. Used for the dashboard chart.
 */
export function dailyBalanceSeries(opening: string, txs: Transaction[], from: string, to: string): SeriesPoint[] {
  const settled = txs.filter((t) => t.status === 'settled' && !t.isSavingsAllocation);
  let bal = dec(opening);
  for (const t of settled) if (t.date < from) bal = bal.plus(signedBase(t));
  const out: SeriesPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const t of settled) if (t.date === d) bal = bal.plus(signedBase(t));
    out.push({ date: d, balance: bal.toString() });
  }
  return out;
}

function signedBase(t: Transaction): string {
  const s = signedAmount(t);
  return s.startsWith('-') ? `-${t.baseAmount}` : s === '0' ? '0' : t.baseAmount;
}
