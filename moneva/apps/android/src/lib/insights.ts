import { format, periodSummary, ratioPct, spendingByCategory, sub, type Transaction } from '@moneva/shared';
import { categoryName } from './categories';
import { pctChange } from './stats';

/** Insights are computed from stored transactions only. No data, no insight. */
export function buildInsights(
  txs: Transaction[],
  from: string,
  to: string,
  currency: string,
  prev?: { from: string; to: string },
): string[] {
  const out: string[] = [];
  const s = periodSummary(txs, from, to);
  const cats = Object.entries(spendingByCategory(txs, from, to)).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (cats[0] && Number(s.expenses) > 0) {
    out.push(
      `${categoryName(cats[0][0])} is your biggest category this month: ${format(cats[0][1], currency)}, ${Math.round(Number(ratioPct(cats[0][1], s.expenses)))}% of your spending.`,
    );
  }
  if (prev) {
    const sp = periodSummary(txs, prev.from, prev.to);
    const ch = pctChange(s.expenses, sp.expenses);
    if (ch !== null && Number(sp.expenses) > 0)
      out.push(
        Number(ch) <= 0
          ? `Your spending is ${Math.abs(Number(ch))}% lower than last month so far.`
          : `Your spending is ${ch}% higher than last month so far.`,
      );
  }
  if (Number(s.pendingExpenses) > 0) out.push(`${format(s.pendingExpenses, currency)} is pending and not yet counted as spent.`);
  if (Number(s.income) > 0 && Number(s.expenses) > Number(s.income))
    out.push(`You have spent ${format(sub(s.expenses, s.income), currency)} more than you received this month.`);
  return out;
}
