import * as SQLite from 'expo-sqlite';
import type { SqlDriver, SqlValue } from './driver';

/** Real on-device SQLite (file `moneva.db` in the app's private storage). */
export async function openExpoDriver(name = 'moneva.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('pragma journal_mode = wal; pragma foreign_keys = on;');
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => void (await db.runAsync(sql, params)),
    all: <T>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    // One connection and one write queue (see ledger store), so explicit BEGIN/COMMIT is atomic and cannot interleave.
    transaction: async (fn) => {
      await db.execAsync('begin');
      try {
        await fn();
        await db.execAsync('commit');
      } catch (e) {
        await db.execAsync('rollback');
        throw e;
      }
    },
  };
}
