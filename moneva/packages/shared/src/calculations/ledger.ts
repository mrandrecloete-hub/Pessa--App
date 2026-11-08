import { add, sub, sum } from '../money/money';
import type { Transaction } from './types';

/**
 * Accounting semantics (single source of truth):
 * - income and refund increase the account; expense decreases it.
 * - transfer_out decreases one account, transfer_in increases another.
 * - only SETTLED transactions touch balances. Pending and cancelled never do.
 */
export function signedAmount(t: Transaction): string {
  if (t.status !== 'settled') return '0';
  switch (t.type) {
    case 'income':
    case 'refund':
    case 'transfer_in':
      return t.amount;
    case 'expense':
    case 'transfer_out':
      return sub('0', t.amount);
  }
}

/** Balance of one account in that account's own currency. */
export function accountBalance(opening: string, txs: Transaction[], accountId: string): string {
  return txs.filter((t) => t.accountId === accountId).reduce((bal, t) => add(bal, signedAmount(t)), opening);
}

export interface PeriodSummary {
  income: string;
  expenses: string;
  net: string;
  pendingExpenses: string;
}

/**
 * Income/expense totals in the BASE currency (uses the stored historical baseAmount,
 * never today's rate). Transfers, savings allocations and cancelled items are excluded.
 * Refunds reduce expenses. Pending expenses are reported separately, not counted.
 */
export function periodSummary(txs: Transaction[], from: string, to: string): PeriodSummary {
  const inRange = txs.filter((t) => t.date >= from && t.date <= to && !t.isSavingsAllocation);
  const settled = inRange.filter((t) => t.status === 'settled');
  const income = sum(settled.filter((t) => t.type === 'income').map((t) => t.baseAmount));
  const gross = sum(settled.filter((t) => t.type === 'expense').map((t) => t.baseAmount));
  const refunds = sum(settled.filter((t) => t.type === 'refund').map((t) => t.baseAmount));
  const expenses = sub(gross, refunds);
  const pendingExpenses = sum(inRange.filter((t) => t.status === 'pending' && t.type === 'expense').map((t) => t.baseAmount));
  return { income, expenses, net: sub(income, expenses), pendingExpenses };
}

export function spendingByCategory(txs: Transaction[], from: string, to: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of txs) {
    if (t.status !== 'settled' || t.date < from || t.date > to || t.isSavingsAllocation) continue;
    if (t.type !== 'expense' && t.type !== 'refund') continue;
    const key = t.categoryId ?? 'uncategorised';
    out[key] = t.type === 'expense' ? add(out[key] ?? '0', t.baseAmount) : sub(out[key] ?? '0', t.baseAmount);
  }
  return out;
}
