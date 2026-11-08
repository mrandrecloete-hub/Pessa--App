import type { SqlDriver } from './driver';

/** Web has no on-device database in MONEVA (web is a preview target only). `openLedgerRepo` never calls this. */
export async function openExpoDriver(): Promise<SqlDriver> {
  throw new Error('The on-device database is not available on web.');
}
