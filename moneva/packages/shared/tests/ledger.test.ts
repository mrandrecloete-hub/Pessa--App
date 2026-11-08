import { describe, expect, it } from 'vitest';
import { accountBalance, periodSummary, spendingByCategory, type Transaction } from '../src';

let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  id: `t${++n}`,
  accountId: 'main',
  type: 'expense',
  amount: '0',
  currency: 'NAD',
  baseCurrency: 'NAD',
  exchangeRate: '1',
  baseAmount: o.amount ?? '0',
  categoryId: null,
  date: '2026-11-05',
  status: 'settled',
  source: 'manual',
  ...o,
});
const t = (o: Partial<Transaction>) => {
  const x = tx(o);
  if (!o.baseAmount) x.baseAmount = x.amount;
  return x;
};

describe('ledger scenarios', () => {
  const txs = [
    t({ type: 'income', amount: '15000', categoryId: 'salary' }),
    t({ amount: '2500', categoryId: 'housing' }),
    t({ amount: '1500', categoryId: 'groceries' }),
    t({ type: 'transfer_out', amount: '1000', accountId: 'main' }),
    t({ type: 'transfer_in', amount: '1000', accountId: 'savings' }),
    t({ amount: '2000', accountId: 'main', isSavingsAllocation: true, categoryId: 'savings' }),
  ];
  it('keeps balances correct', () => {
    expect(accountBalance('0', txs, 'main')).toBe('8000'); // 15000-2500-1500-1000-2000
    expect(accountBalance('0', txs, 'savings')).toBe('1000');
  });
  it('does not count transfers or savings allocations as expenses', () => {
    const s = periodSummary(txs, '2026-11-01', '2026-11-30');
    expect(s.income).toBe('15000');
    expect(s.expenses).toBe('4000');
    expect(s.net).toBe('11000');
  });
  it('ignores pending until settled, then counts once', () => {
    const p = t({ amount: '300', status: 'pending', categoryId: 'fuel' });
    expect(periodSummary([p], '2026-11-01', '2026-11-30')).toMatchObject({ expenses: '0', pendingExpenses: '300' });
    expect(accountBalance('1000', [p], 'main')).toBe('1000');
    const settled = { ...p, status: 'settled' as const };
    expect(periodSummary([settled], '2026-11-01', '2026-11-30').expenses).toBe('300');
  });
  it('refunds reduce spending in the category', () => {
    const e = t({ amount: '500', categoryId: 'shopping' });
    const r = t({ type: 'refund', amount: '200', categoryId: 'shopping', refundOf: e.id });
    expect(spendingByCategory([e, r], '2026-11-01', '2026-11-30')).toEqual({ shopping: '300' });
  });
  it('uses the stored historical base amount, not a new rate', () => {
    const e = t({ amount: '50', currency: 'USD', exchangeRate: '18', baseAmount: '900' });
    expect(periodSummary([e], '2026-11-01', '2026-11-30').expenses).toBe('900');
  });
  it('edit and delete: deleting a transaction removes its effect', () => {
    const e = t({ amount: '100' });
    expect(accountBalance('500', [e], 'main')).toBe('400');
    expect(accountBalance('500', [{ ...e, status: 'cancelled' }], 'main')).toBe('500');
  });
});
