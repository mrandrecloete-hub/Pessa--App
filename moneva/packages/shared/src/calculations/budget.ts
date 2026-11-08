import { allocate, cmp, dec, ratioPct, sub } from '../money/money';

export type BudgetMethod = '50/30/20' | '60/20/20' | 'custom';

export interface BudgetBucket {
  key: 'needs' | 'wants' | 'savings';
  label: string;
  percent: string;
  amount: string;
}

const PRESETS: Record<Exclude<BudgetMethod, 'custom'>, [string, string, string]> = {
  '50/30/20': ['50', '30', '20'],
  '60/20/20': ['60', '20', '20'],
};

/**
 * Suggested allocation of monthly income. Amounts sum EXACTLY to income.
 * This is a suggestion only: the user may change every number.
 */
export function suggestBudget(income: string, currency: string, method: BudgetMethod, custom?: [string, string, string]): BudgetBucket[] {
  const p = method === 'custom' ? custom : PRESETS[method];
  if (!p) throw new Error('Custom method needs three percentages');
  if (!dec(p[0]).plus(p[1]).plus(p[2]).eq(100)) throw new Error('Percentages must add up to 100');
  const amounts = allocate(income, p, currency);
  const labels: Array<[BudgetBucket['key'], string]> =
    method === '60/20/20'
      ? [
          ['needs', 'Essentials'],
          ['wants', 'Lifestyle'],
          ['savings', 'Savings and priorities'],
        ]
      : [
          ['needs', 'Needs'],
          ['wants', 'Wants'],
          ['savings', 'Savings and debt'],
        ];
  return labels.map(([key, label], i) => ({ key, label, percent: p[i]!, amount: amounts[i]! }));
}

export type AlertLevel = 'none' | 'progress' | 'warning' | 'strong' | 'exceeded';

export interface BudgetThresholds {
  progress: number;
  warning: number;
  strong: number;
}
export const DEFAULT_THRESHOLDS: BudgetThresholds = { progress: 50, warning: 75, strong: 90 };

export interface BudgetStatus {
  allocated: string;
  spent: string;
  remaining: string;
  percentUsed: string;
  alert: AlertLevel;
}

export function budgetStatus(allocated: string, spent: string, th: BudgetThresholds = DEFAULT_THRESHOLDS): BudgetStatus {
  const percentUsed = ratioPct(spent, allocated);
  const p = dec(percentUsed);
  let alert: AlertLevel = 'none';
  if (cmp(spent, allocated) > 0) alert = 'exceeded';
  else if (dec(allocated).gt(0) && p.gte(100)) alert = 'exceeded';
  else if (p.gte(th.strong)) alert = 'strong';
  else if (p.gte(th.warning)) alert = 'warning';
  else if (p.gte(th.progress)) alert = 'progress';
  return { allocated, spent, remaining: sub(allocated, spent), percentUsed, alert };
}

export interface Forecast {
  projectedSpend: string;
  projectedRemaining: string;
  willExceed: boolean;
  basis: 'actual-run-rate' | 'insufficient-data';
}

/**
 * Linear run-rate forecast from SETTLED spend so far. Needs at least 3 elapsed days to
 * give a projection, otherwise it says so instead of guessing.
 * Pending transactions are never included in `spentSoFar`.
 */
export function forecastMonth(allocated: string, spentSoFar: string, daysElapsed: number, daysInMonth: number): Forecast {
  if (daysElapsed < 3 || daysElapsed > daysInMonth) {
    return {
      projectedSpend: spentSoFar,
      projectedRemaining: sub(allocated, spentSoFar),
      willExceed: cmp(spentSoFar, allocated) > 0,
      basis: 'insufficient-data',
    };
  }
  const projected = dec(spentSoFar).div(daysElapsed).times(daysInMonth).toDecimalPlaces(2).toString();
  return {
    projectedSpend: projected,
    projectedRemaining: sub(allocated, projected),
    willExceed: cmp(projected, allocated) > 0,
    basis: 'actual-run-rate',
  };
}
