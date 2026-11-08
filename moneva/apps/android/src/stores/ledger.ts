import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  add,
  transactionInputSchema,
  type ImportCandidate,
  type Transaction,
  type TransactionInput,
  type TransactionSource,
} from '@moneva/shared';

export interface Account {
  id: string;
  name: string;
  currency: string;
  opening: string;
}

export interface Contribution {
  id: string;
  amount: string;
  date: string;
}
/** A savings goal is the user's own tracking. Contributions are NOT bank transfers and never change account balances. */
export interface Goal {
  id: string;
  name: string;
  target: string;
  saved: string;
  targetDate?: string;
  contributions: Contribution[];
}

interface Ledger {
  accounts: Account[];
  transactions: Transaction[];
  /** Fingerprints of imported rows, kept so the same statement can never be imported twice. */
  importedFingerprints: string[];
  goals: Goal[];
  addGoal: (g: { name: string; target: string; targetDate?: string }) => { ok: true } | { ok: false; error: string };
  contribute: (goalId: string, amount: string, date: string) => { ok: true } | { ok: false; error: string };
  deleteGoal: (id: string) => void;
  addTransaction: (
    input: TransactionInput,
    baseCurrency: string,
    source?: TransactionSource,
  ) => { ok: true; id: string } | { ok: false; error: string };
  importCandidates: (accountId: string, rows: ImportCandidate[], baseCurrency: string) => { added: number; skippedDuplicates: number };
  addScannedIncome: (args: { accountId: string; amount: string; date: string; description: string; baseCurrency: string }) => string;
  deleteTransaction: (id: string) => void;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const DEFAULT_ACCOUNT: Account = { id: 'main', name: 'Main account', currency: 'NAD', opening: '0' };

export const useLedger = create<Ledger>()(
  persist(
    (set, get) => ({
      accounts: [DEFAULT_ACCOUNT],
      transactions: [],
      importedFingerprints: [],
      goals: [],
      addGoal: ({ name, target, targetDate }) => {
        if (!name.trim()) return { ok: false, error: 'Give the goal a name.' };
        if (!/^\d+(\.\d{1,2})?$/.test(target) || Number(target) <= 0) return { ok: false, error: 'Enter a target amount above zero.' };
        if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { ok: false, error: 'Use the date format YYYY-MM-DD.' };
        set((s) => ({
          goals: [...s.goals, { id: uid(), name: name.trim(), target, saved: '0', targetDate: targetDate || undefined, contributions: [] }],
        }));
        return { ok: true };
      },
      contribute: (goalId, amount, date) => {
        if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return { ok: false, error: 'Enter an amount above zero.' };
        if (!get().goals.some((g) => g.id === goalId)) return { ok: false, error: 'Goal not found.' };
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id === goalId ? { ...g, saved: add(g.saved, amount), contributions: [{ id: uid(), amount, date }, ...g.contributions] } : g,
          ),
        }));
        return { ok: true };
      },
      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      addTransaction: (input, baseCurrency, source = 'manual') => {
        const parsed = transactionInputSchema.safeParse(input);
        if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid transaction' };
        const v = parsed.data;
        if (v.currency !== baseCurrency)
          return { ok: false, error: 'Foreign currency needs an exchange rate. Multi-currency arrives in Stage 6.' };
        const id = uid();
        const t: Transaction = {
          id,
          accountId: v.accountId,
          type: v.type,
          amount: v.amount,
          currency: v.currency,
          baseCurrency,
          exchangeRate: '1',
          baseAmount: v.amount,
          categoryId: v.categoryId,
          merchant: v.merchant ?? null,
          date: v.date,
          status: 'settled',
          source,
          description: v.description,
        };
        set((s) => ({ transactions: [t, ...s.transactions] }));
        return { ok: true, id };
      },
      importCandidates: (accountId, rows, baseCurrency) => {
        const known = new Set(get().importedFingerprints);
        const fresh: Transaction[] = [];
        let skipped = 0;
        for (const r of rows) {
          if (known.has(r.fingerprint) || r.direction === 'unknown') {
            skipped += known.has(r.fingerprint) ? 1 : 0;
            continue;
          }
          known.add(r.fingerprint);
          fresh.push({
            id: uid(),
            accountId,
            type: r.direction === 'in' ? 'income' : 'expense',
            amount: r.amount,
            currency: baseCurrency,
            baseCurrency,
            exchangeRate: '1',
            baseAmount: r.amount,
            categoryId: r.categoryId,
            merchant: null,
            date: r.date,
            status: 'settled',
            source: 'import',
            externalId: r.fingerprint,
            description: r.description,
          });
        }
        set((s) => ({ transactions: [...fresh, ...s.transactions], importedFingerprints: [...known] }));
        return { added: fresh.length, skippedDuplicates: skipped };
      },
      addScannedIncome: ({ accountId, amount, date, description, baseCurrency }) => {
        const id = uid();
        const t: Transaction = {
          id,
          accountId,
          type: 'income',
          amount,
          currency: baseCurrency,
          baseCurrency,
          exchangeRate: '1',
          baseAmount: amount,
          categoryId: 'salary',
          merchant: null,
          date,
          status: 'settled',
          source: 'scan',
          description,
        };
        set((s) => ({ transactions: [t, ...s.transactions] }));
        return id;
      },
      deleteTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
    }),
    { name: 'moneva-ledger', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
