/** Minimal async SQL interface so the same repository runs on the phone (expo-sqlite) and in Node tests (node:sqlite). */
export type SqlValue = string | number | null;
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs `fn` atomically: all statements commit together or none do. */
  transaction(fn: () => Promise<void>): Promise<void>;
}
