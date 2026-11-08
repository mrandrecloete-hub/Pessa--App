import { Platform } from 'react-native';
import { openExpoDriver } from './expoDriver';
import { LedgerRepo } from './repo';

/** Opens the on-device database. Returns null on web, where MONEVA keeps data in memory only (web is not a target). */
export async function openLedgerRepo(): Promise<LedgerRepo | null> {
  if (Platform.OS === 'web') return null;
  return LedgerRepo.open(await openExpoDriver());
}
