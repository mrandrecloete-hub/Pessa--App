// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { accountBalance, buildCandidates, parseStatementCsv, periodSummary } from '@moneva/shared';
import { useLedger } from '@/stores/ledger';
import { buildInsights } from '@/lib/insights';

const reset = () => useLedger.setState({ transactions: [], importedFingerprints: [] });
const csv =
  'Date,Description,Debit,Credit,Balance\n01/11/2026,SALARY ACME,,15000.00,15000.00\n02/11/2026,SHOPRITE,1500.00,,13500.00\n03/11/2026,ENGEN,300.00,,13200.00\n';

describe('ledger store', () => {
  beforeEach(reset);
  it('records salary, rent, groceries and updates balance', () => {
    const { addTransaction } = useLedger.getState();
    const base = { currency: 'NAD', accountId: 'main', date: '2026-11-02' } as const;
    expect(addTransaction({ ...base, type: 'income', amount: '15000', categoryId: 'salary' }, 'NAD').ok).toBe(true);
    expect(addTransaction({ ...base, type: 'expense', amount: '2500', categoryId: 'housing' }, 'NAD').ok).toBe(true);
    expect(addTransaction({ ...base, type: 'expense', amount: '1500', categoryId: 'groceries' }, 'NAD').ok).toBe(true);
    const { transactions } = useLedger.getState();
    expect(accountBalance('0', transactions, 'main')).toBe('11000');
    expect(periodSummary(transactions, '2026-11-01', '2026-11-30')).toMatchObject({ income: '15000', expenses: '4000' });
  });
  it('rejects invalid input and foreign currency without a rate', () => {
    const { addTransaction } = useLedger.getState();
    expect(
      addTransaction({ type: 'expense', amount: '-5', currency: 'NAD', accountId: 'main', categoryId: 'fuel', date: '2026-11-02' }, 'NAD')
        .ok,
    ).toBe(false);
    expect(
      addTransaction({ type: 'expense', amount: '5', currency: 'USD', accountId: 'main', categoryId: 'fuel', date: '2026-11-02' }, 'NAD')
        .ok,
    ).toBe(false);
    expect(useLedger.getState().transactions).toHaveLength(0);
  });
  it('importing the same statement twice does not duplicate', () => {
    const rows = parseStatementCsv(csv, 2026).rows;
    const run = () => {
      const c = buildCandidates('main', rows, new Set(useLedger.getState().importedFingerprints)).filter(
        (x) => !x.duplicate && !x.needsReview,
      );
      return useLedger.getState().importCandidates('main', c, 'NAD');
    };
    expect(run().added).toBe(3);
    expect(run().added).toBe(0);
    expect(useLedger.getState().transactions).toHaveLength(3);
    expect(accountBalance('0', useLedger.getState().transactions, 'main')).toBe('13200');
  });
  it('insights only come from real data', () => {
    expect(buildInsights([], '2026-11-01', '2026-11-30', 'NAD')).toEqual([]);
    const rows = parseStatementCsv(csv, 2026).rows;
    useLedger.getState().importCandidates('main', buildCandidates('main', rows, new Set()), 'NAD');
    const ins = buildInsights(useLedger.getState().transactions, '2026-11-01', '2026-11-30', 'NAD');
    expect(ins[0]).toContain('Groceries');
    expect(ins[0]).toContain('N$1,500.00');
  });
});
