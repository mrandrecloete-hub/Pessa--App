import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';

/** Preview only (EXPO_PUBLIC_DEMO=1). Every demo record is labelled "(demo)". Never enabled in real builds. */
export const DEMO_ENABLED = process.env.EXPO_PUBLIC_DEMO === '1';

const pad = (n: number) => String(n).padStart(2, '0');
const day = (monthOffset: number, d: number) => {
  const x = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(d)}`;
};

export function loadDemoData(): void {
  const { addTransaction, addGoal, contribute, goals } = useLedger.getState();
  const rows: Array<['income' | 'expense', string, string, number, number, string]> = [
    ['income', '18500', 'salary', 0, 1, 'Salary'],
    ['expense', '4240', 'housing', 0, 2, 'Rent'],
    ['expense', '3710', 'groceries', 0, 3, 'Shoprite'],
    ['expense', '2380', 'transport', 0, 4, 'Engen fuel'],
    ['expense', '1700', 'restaurants', 0, 5, 'Dinner'],
    ['expense', '1220', 'entertainment', 0, 5, 'Cinema'],
    ['income', '17100', 'salary', -1, 1, 'Salary'],
    ['expense', '3900', 'housing', -1, 2, 'Rent'],
    ['expense', '3200', 'groceries', -1, 6, 'Checkers'],
    ['income', '16800', 'salary', -2, 1, 'Salary'],
    ['expense', '7600', 'housing', -2, 2, 'Rent'],
  ];
  const base = usePrefs.getState().baseCurrency;
  for (const [type, amount, categoryId, m, d, name] of rows) {
    addTransaction({ type, amount, currency: base, accountId: 'main', categoryId, date: day(m, d), description: `${name} (demo)` }, base);
  }
  if (!goals.some((g) => g.name.includes('(demo)'))) {
    addGoal({ name: 'Emergency Fund (demo)', target: '20000' });
    const id = useLedger.getState().goals.at(-1)!.id;
    contribute(id, '6000', day(0, 3));
  }
  usePrefs.getState().setMonthlyBudget('19500');
}
