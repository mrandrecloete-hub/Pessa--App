/**
 * On-device schema. Money is stored as TEXT decimal strings (exact), never REAL.
 * Mirrors the Supabase tables so a later sync can map rows one to one.
 * Add new steps to the END of MIGRATIONS; never edit a step that has shipped.
 */
export const MIGRATIONS: string[] = [
  `
  create table accounts(
    id text primary key,
    name text not null,
    currency text not null,
    opening text not null default '0'
  );
  create table transactions(
    id text primary key,
    account_id text not null references accounts(id),
    type text not null check (type in ('income','expense','transfer_in','transfer_out','refund')),
    amount text not null,
    currency text not null,
    base_currency text not null,
    exchange_rate text not null,
    base_amount text not null,
    category_id text,
    merchant text,
    date text not null check (date glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    status text not null check (status in ('pending','settled','cancelled')),
    source text not null check (source in ('manual','bank','import','scan','recurring')),
    external_id text,
    refund_of text,
    is_savings_allocation integer not null default 0,
    description text
  );
  create unique index transactions_external on transactions(source, external_id) where external_id is not null;
  create index transactions_date on transactions(date);
  create table goals(
    id text primary key,
    name text not null,
    target text not null,
    target_date text
  );
  create table contributions(
    id text primary key,
    goal_id text not null references goals(id) on delete cascade,
    amount text not null,
    date text not null
  );
  create table imported_fingerprints(fingerprint text primary key);
  create table meta(key text primary key, value text not null);
  `,
];

export async function migrate(db: { exec(sql: string): Promise<void>; all<T>(sql: string): Promise<T[]> }): Promise<void> {
  await db.exec('pragma foreign_keys = on;');
  const [row] = await db.all<{ user_version: number }>('pragma user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    try {
      await db.exec(`begin; ${MIGRATIONS[v]}; pragma user_version = ${v + 1}; commit;`);
    } catch (e) {
      await db.exec('rollback').catch(() => undefined);
      throw e;
    }
  }
}
