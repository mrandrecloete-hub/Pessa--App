/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
/* eslint-disable @typescript-eslint/no-require-imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Transaction } from '@moneva/shared';
import type { SqlDriver, SqlValue } from '@/db/driver';
import { LedgerRepo } from '@/db/repo';
import { DEFAULT_ACCOUNT, flushLedgerWrites, initLedger, useLedger } from '@/stores/ledger';

const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (p: string) => {
    exec(s: string): void;
    prepare(s: string): { run(...p: SqlValue[]): unknown; all(...p: SqlValue[]): unknown[] };
  };
};

function nodeDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  return {
    exec: async (sql) => db.exec(sql),
    run: async (sql, p = []) => void db.prepare(sql).run(...p),
    all: async <T>(sql: string, p: SqlValue[] = []) => db.prepare(sql).all(...p) as T[],
    transaction: async (fn) => {
      db.exec('begin');
      try {
        await fn();
        db.exec('commit');
      } catch (e) {
        db.exec('rollback');
        throw e;
      }
    },
  };
}
const tmp = () => join(mkdtempSync(join(tmpdir(), 'moneva-')), 'test.db');
let n = 0;
const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  accountId: 'main',
  type: 'expense',
  amount: '100',
  currency: 'NAD',
  baseCurrency: 'NAD',
  exchangeRate: '1',
  baseAmount: '100',
  categoryId: 'groceries',
  merchant: null,
  date: '2026-11-05',
  status: 'settled',
  source: 'manual',
  ...o,
});
const open = async (path = ':memory:') => {
  const r = await LedgerRepo.open(nodeDriver(path));
  await r.ensureAccount(DEFAULT_ACCOUNT);
  return r;
};

describe('on-device database', () => {
  it('keeps decimals exact and survives closing and reopening the file', async () => {
    const path = tmp();
    const a = await open(path);
    await a.insertTransactions([
      tx({ amount: '0.1', baseAmount: '0.1' }),
      tx({ amount: '1234.56', baseAmount: '1234.56', type: 'income' }),
    ]);
    const b = await open(path);
    const snap = await b.load();
    expect(snap.transactions.map((t) => t.amount).sort()).toEqual(['0.1', '1234.56']);
  });
  it('rejects invalid rows at the database level', async () => {
    const r = await open();
    await expect(r.insertTransactions([tx({ date: '05/11/2026' })])).rejects.toThrow();
    await expect(r.insertTransactions([tx({ type: 'bogus' as never })])).rejects.toThrow();
    await expect(r.insertTransactions([tx({ accountId: 'nobody' })])).rejects.toThrow();
  });
  it('an import batch is all or nothing, and a repeated bank key cannot be stored twice', async () => {
    const r = await open();
    await r.insertTransactions([tx({ source: 'import', externalId: 'fp1' })], ['fp1']);
    await expect(
      r.insertTransactions([tx({ source: 'import', externalId: 'fp2' }), tx({ source: 'import', externalId: 'fp1' })], ['fp2']),
    ).rejects.toThrow();
    const snap = await r.load();
    expect(snap.transactions).toHaveLength(1);
    expect(snap.importedFingerprints).toEqual(['fp1']);
  });
  it('goals sum their contributions exactly and delete with them', async () => {
    const r = await open();
    await r.insertGoal({ id: 'g1', name: 'Car', target: '50000' });
    await r.addContribution('g1', { id: 'c1', amount: '0.10', date: '2026-11-01' });
    await r.addContribution('g1', { id: 'c2', amount: '0.20', date: '2026-11-02' });
    expect((await r.load()).goals[0]!.saved).toBe('0.3');
    await r.deleteGoal('g1');
    expect((await r.load()).goals).toHaveLength(0);
    expect(await (r as unknown as { db: SqlDriver }).db.all('select * from contributions')).toHaveLength(0);
  });
  it('moves old AsyncStorage data in exactly once', async () => {
    const r = await open();
    const legacy = {
      accounts: [DEFAULT_ACCOUNT],
      transactions: [tx({ id: 'old1' })],
      goals: [{ id: 'og', name: 'Old', target: '10', saved: '5', contributions: [{ id: 'oc', amount: '5', date: '2026-10-01' }] }],
      importedFingerprints: ['x'],
    };
    expect(await r.importLegacy(legacy)).toBe(true);
    expect(await r.importLegacy(legacy)).toBe(false);
    const snap = await r.load();
    expect(snap.transactions).toHaveLength(1);
    expect(snap.goals[0]!.saved).toBe('5');
  });
});

describe('ledger store backed by the database', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useLedger.setState({
      ready: false,
      saveError: null,
      transactions: [],
      goals: [],
      importedFingerprints: [],
      accounts: [DEFAULT_ACCOUNT],
    });
  });
  it('writes through, and a fresh start reloads the same data', async () => {
    const path = tmp();
    await initLedger(async () => open(path));
    useLedger
      .getState()
      .addTransaction(
        { type: 'income', amount: '15000', currency: 'NAD', accountId: 'main', categoryId: 'salary', date: '2026-11-01' },
        'NAD',
      );
    useLedger.getState().addGoal({ name: 'Emergency', target: '20000' });
    useLedger.getState().contribute(useLedger.getState().goals[0]!.id, '2000', '2026-11-02');
    await flushLedgerWrites();
    expect(useLedger.getState().saveError).toBeNull();
    useLedger.setState({ transactions: [], goals: [] }); // simulate app restart: memory gone
    await initLedger(async () => open(path));
    expect(useLedger.getState().transactions).toHaveLength(1);
    expect(useLedger.getState().goals[0]).toMatchObject({ name: 'Emergency', saved: '2000' });
    expect(useLedger.getState().ready).toBe(true);
  });
  it('migrates the first build data from AsyncStorage and clears it', async () => {
    await AsyncStorage.setItem(
      'moneva-ledger',
      JSON.stringify({
        state: {
          accounts: [DEFAULT_ACCOUNT],
          transactions: [tx({ id: 'legacy1', amount: '77', baseAmount: '77' })],
          goals: [],
          importedFingerprints: [],
        },
        version: 0,
      }),
    );
    await initLedger(async () => open());
    expect(useLedger.getState().transactions.map((t) => t.id)).toContain('legacy1');
    expect(await AsyncStorage.getItem('moneva-ledger')).toBeNull();
  });
  it('shows a save error instead of failing silently', async () => {
    const r = await open();
    await initLedger(async () => r);
    jest.spyOn(r, 'insertTransactions').mockRejectedValueOnce(new Error('disk full'));
    useLedger
      .getState()
      .addTransaction({ type: 'expense', amount: '5', currency: 'NAD', accountId: 'main', categoryId: 'fuel', date: '2026-11-02' }, 'NAD');
    await flushLedgerWrites();
    expect(useLedger.getState().saveError).toBe('disk full');
    expect(useLedger.getState().transactions).toHaveLength(1);
  });
  it('still works with no database (tests, web)', async () => {
    await initLedger(async () => null);
    expect(useLedger.getState().ready).toBe(true);
  });
});
