import { add, type Transaction } from '@moneva/shared';
import type { SqlDriver } from './driver';
import { migrate } from './schema';

export interface DbAccount {
  id: string;
  name: string;
  currency: string;
  opening: string;
}
export interface DbContribution {
  id: string;
  amount: string;
  date: string;
}
export interface DbGoal {
  id: string;
  name: string;
  target: string;
  saved: string;
  targetDate?: string;
  contributions: DbContribution[];
}
export interface LedgerSnapshot {
  accounts: DbAccount[];
  transactions: Transaction[];
  goals: DbGoal[];
  importedFingerprints: string[];
}

interface TxRow {
  id: string;
  account_id: string;
  type: Transaction['type'];
  amount: string;
  currency: string;
  base_currency: string;
  exchange_rate: string;
  base_amount: string;
  category_id: string | null;
  merchant: string | null;
  date: string;
  status: Transaction['status'];
  source: Transaction['source'];
  external_id: string | null;
  refund_of: string | null;
  is_savings_allocation: number;
  description: string | null;
}

const toTx = (r: TxRow): Transaction => ({
  id: r.id,
  accountId: r.account_id,
  type: r.type,
  amount: r.amount,
  currency: r.currency,
  baseCurrency: r.base_currency,
  exchangeRate: r.exchange_rate,
  baseAmount: r.base_amount,
  categoryId: r.category_id,
  merchant: r.merchant,
  date: r.date,
  status: r.status,
  source: r.source,
  externalId: r.external_id,
  refundOf: r.refund_of,
  isSavingsAllocation: r.is_savings_allocation === 1,
  description: r.description ?? undefined,
});

/** All reads and writes to the on-device database. Writes that belong together run in one transaction. */
export class LedgerRepo {
  constructor(private db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<LedgerRepo> {
    await migrate(db);
    return new LedgerRepo(db);
  }

  async load(): Promise<LedgerSnapshot> {
    const accounts = await this.db.all<DbAccount>('select id, name, currency, opening from accounts order by rowid');
    const txs = await this.db.all<TxRow>('select * from transactions order by date desc, rowid desc');
    const goalRows = await this.db.all<{ id: string; name: string; target: string; target_date: string | null }>(
      'select * from goals order by rowid',
    );
    const contribs = await this.db.all<{ id: string; goal_id: string; amount: string; date: string }>(
      'select * from contributions order by date desc, rowid desc',
    );
    const fps = await this.db.all<{ fingerprint: string }>('select fingerprint from imported_fingerprints');
    const goals: DbGoal[] = goalRows.map((g) => {
      const cs = contribs.filter((c) => c.goal_id === g.id).map((c) => ({ id: c.id, amount: c.amount, date: c.date }));
      return {
        id: g.id,
        name: g.name,
        target: g.target,
        saved: cs.reduce((s, c) => add(s, c.amount), '0'),
        targetDate: g.target_date ?? undefined,
        contributions: cs,
      };
    });
    return { accounts, transactions: txs.map(toTx), goals, importedFingerprints: fps.map((f) => f.fingerprint) };
  }

  async ensureAccount(a: DbAccount): Promise<void> {
    await this.db.run('insert or ignore into accounts(id, name, currency, opening) values (?,?,?,?)', [
      a.id,
      a.name,
      a.currency,
      a.opening,
    ]);
  }

  private insertTxSql = `insert into transactions(id, account_id, type, amount, currency, base_currency, exchange_rate, base_amount, category_id, merchant, date, status, source, external_id, refund_of, is_savings_allocation, description)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  private txParams = (t: Transaction) => [
    t.id,
    t.accountId,
    t.type,
    t.amount,
    t.currency,
    t.baseCurrency,
    t.exchangeRate,
    t.baseAmount,
    t.categoryId,
    t.merchant ?? null,
    t.date,
    t.status,
    t.source,
    t.externalId ?? null,
    t.refundOf ?? null,
    t.isSavingsAllocation ? 1 : 0,
    t.description ?? null,
  ];

  /** Inserts transactions and their import fingerprints together. A duplicate import key rolls the whole batch back. */
  async insertTransactions(txs: Transaction[], fingerprints: string[] = []): Promise<void> {
    await this.db.transaction(async () => {
      for (const t of txs) await this.db.run(this.insertTxSql, this.txParams(t));
      for (const f of fingerprints) await this.db.run('insert or ignore into imported_fingerprints(fingerprint) values (?)', [f]);
    });
  }
  async deleteTransaction(id: string): Promise<void> {
    await this.db.run('delete from transactions where id = ?', [id]);
  }

  async insertGoal(g: { id: string; name: string; target: string; targetDate?: string }): Promise<void> {
    await this.db.run('insert into goals(id, name, target, target_date) values (?,?,?,?)', [g.id, g.name, g.target, g.targetDate ?? null]);
  }
  async deleteGoal(id: string): Promise<void> {
    await this.db.run('delete from goals where id = ?', [id]);
  }
  async addContribution(goalId: string, c: DbContribution): Promise<void> {
    await this.db.run('insert into contributions(id, goal_id, amount, date) values (?,?,?,?)', [c.id, goalId, c.amount, c.date]);
  }

  async getMeta(key: string): Promise<string | null> {
    const [r] = await this.db.all<{ value: string }>('select value from meta where key = ?', [key]);
    return r?.value ?? null;
  }
  async setMeta(key: string, value: string): Promise<void> {
    await this.db.run('insert into meta(key, value) values (?,?) on conflict(key) do update set value = excluded.value', [key, value]);
  }

  /** One time move of data saved by the first MONEVA build (AsyncStorage JSON). Safe to call repeatedly. */
  async importLegacy(legacy: Partial<LedgerSnapshot>): Promise<boolean> {
    if ((await this.getMeta('legacy_imported')) === '1') return false;
    await this.db.transaction(async () => {
      for (const a of legacy.accounts ?? [])
        await this.db.run('insert or ignore into accounts(id, name, currency, opening) values (?,?,?,?)', [
          a.id,
          a.name,
          a.currency,
          a.opening,
        ]);
      for (const t of legacy.transactions ?? [])
        await this.db.run(`insert or ignore into ${this.insertTxSql.slice('insert into '.length)}`, this.txParams(t));
      for (const g of legacy.goals ?? []) {
        await this.db.run('insert or ignore into goals(id, name, target, target_date) values (?,?,?,?)', [
          g.id,
          g.name,
          g.target,
          g.targetDate ?? null,
        ]);
        for (const c of g.contributions)
          await this.db.run('insert or ignore into contributions(id, goal_id, amount, date) values (?,?,?,?)', [
            c.id,
            g.id,
            c.amount,
            c.date,
          ]);
      }
      for (const f of legacy.importedFingerprints ?? [])
        await this.db.run('insert or ignore into imported_fingerprints(fingerprint) values (?)', [f]);
      await this.db.run("insert into meta(key, value) values ('legacy_imported','1') on conflict(key) do update set value = '1'");
    });
    return true;
  }
}
