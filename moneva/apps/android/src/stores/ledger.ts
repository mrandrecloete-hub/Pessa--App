import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  add,
  transactionInputSchema,
  type ImportCandidate,
  type Transaction,
  type TransactionInput,
  type TransactionSource,
} from '@moneva/shared';
import { openLedgerRepo } from '@/db';
import type { LedgerRepo } from '@/db/repo';

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

type Result = { ok: true } | { ok: false; error: string };

interface Ledger {
  /** True once the on-device database has been read (or there is none, as in tests and on web). */
  ready: boolean;
  /** Set when the last write to the phone's database failed. The change may be lost after a restart. */
  saveError: string | null;
  accounts: Account[];
  transactions: Transaction[];
  /** Fingerprints of imported rows, kept so the same statement can never be imported twice. */
  importedFingerprints: string[];
  goals: Goal[];
  addGoal: (g: { name: string; target: string; targetDate?: string }) => Result;
  contribute: (goalId: string, amount: string, date: string) => Result;
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

let repo: LedgerRepo | null = null;
let queue: Promise<void> = Promise.resolve();

/** Runs database writes one at a time, in order. A failure is recorded, never swallowed silently. */
function persist(write: (r: LedgerRepo) => Promise<void>): void {
  if (!repo) return;
  const r = repo;
  queue = queue
    .then(() => write(r))
    .then(() => {
      if (useLedger.getState().saveError) useLedger.setState({ saveError: null });
    })
    .catch((e: unknown) => useLedger.setState({ saveError: e instanceof Error ? e.message : 'Could not save to this phone.' }));
}

export const useLedger = create<Ledger>()((set, get) => ({
  ready: false,
  saveError: null,
  accounts: [DEFAULT_ACCOUNT],
  transactions: [],
  importedFingerprints: [],
  goals: [],

  addGoal: ({ name, target, targetDate }) => {
    if (!name.trim()) return { ok: false, error: 'Give the goal a name.' };
    if (!/^\d+(\.\d{1,2})?$/.test(target) || Number(target) <= 0) return { ok: false, error: 'Enter a target amount above zero.' };
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return { ok: false, error: 'Use the date format YYYY-MM-DD.' };
    const goal: Goal = { id: uid(), name: name.trim(), target, saved: '0', targetDate: targetDate || undefined, contributions: [] };
    set((s) => ({ goals: [...s.goals, goal] }));
    persist((r) => r.insertGoal(goal));
    return { ok: true };
  },
  contribute: (goalId, amount, date) => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return { ok: false, error: 'Enter an amount above zero.' };
    if (!get().goals.some((g) => g.id === goalId)) return { ok: false, error: 'Goal not found.' };
    const c: Contribution = { id: uid(), amount, date };
    set((s) => ({
      goals: s.goals.map((g) => (g.id === goalId ? { ...g, saved: add(g.saved, amount), contributions: [c, ...g.contributions] } : g)),
    }));
    persist((r) => r.addContribution(goalId, c));
    return { ok: true };
  },
  deleteGoal: (id) => {
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }));
    persist((r) => r.deleteGoal(id));
  },

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
    persist((r) => r.insertTransactions([t]));
    return { ok: true, id };
  },

  importCandidates: (accountId, rows, baseCurrency) => {
    const known = new Set(get().importedFingerprints);
    const fresh: Transaction[] = [];
    const newFps: string[] = [];
    let skipped = 0;
    for (const r of rows) {
      if (known.has(r.fingerprint)) {
        skipped++;
        continue;
      }
      if (r.direction === 'unknown') continue;
      known.add(r.fingerprint);
      newFps.push(r.fingerprint);
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
    if (fresh.length) persist((r) => r.insertTransactions(fresh, newFps));
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
    persist((r) => r.insertTransactions([t]));
    return id;
  },

  deleteTransaction: (id) => {
    set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
    persist((r) => r.deleteTransaction(id));
  },
}));

/**
 * Opens the phone's database, moves data saved by the first MONEVA build (AsyncStorage) into it once,
 * and loads everything into memory. Call once at app start. Without a database (tests, web) it just marks ready.
 */
export async function initLedger(openRepo: () => Promise<LedgerRepo | null> = openLedgerRepo): Promise<void> {
  try {
    const r = await openRepo();
    if (r) {
      await r.ensureAccount(DEFAULT_ACCOUNT);
      const legacyRaw = await AsyncStorage.getItem('moneva-ledger');
      if (legacyRaw) {
        const legacy = (JSON.parse(legacyRaw) as { state?: Parameters<LedgerRepo['importLegacy']>[0] }).state;
        if (legacy) await r.importLegacy(legacy);
        await AsyncStorage.removeItem('moneva-ledger'); // only reached after a successful import
      }
      const snap = await r.load();
      repo = r;
      useLedger.setState({ ...snap, accounts: snap.accounts.length ? snap.accounts : [DEFAULT_ACCOUNT], ready: true });
      return;
    }
  } catch (e) {
    useLedger.setState({
      saveError: `The phone's database could not be opened: ${e instanceof Error ? e.message : 'unknown error'}. Changes will not be saved.`,
    });
  }
  useLedger.setState({ ready: true });
}

/** Test helper: waits until every queued database write has finished. */
export const flushLedgerWrites = (): Promise<void> => queue;
