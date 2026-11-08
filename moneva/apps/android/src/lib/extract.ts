import * as FileSystem from 'expo-file-system/legacy';
import { parseExtractionJson, type Extraction } from '@moneva/shared';
import { supabase } from './supabase';

export type ExtractKind = 'receipt' | 'payslip' | 'bank_statement';
export interface PickedFile {
  uri?: string;
  base64?: string;
  mimeType: string;
}

export class ScanUnavailable extends Error {}

/**
 * Sends a photo or PDF to the `extract-document` Edge Function (server holds the AI key) and
 * validates what comes back. Needs Supabase configured, the function deployed and the user signed in.
 */
export async function extractDocument(file: PickedFile, kind: ExtractKind): Promise<Extraction> {
  if (!supabase)
    throw new ScanUnavailable(
      'Reading photos and PDFs needs the online service, which is not set up in this build. You can still import a CSV or paste text.',
    );
  const { data: s } = await supabase.auth.getSession();
  if (!s.session)
    throw new ScanUnavailable('Sign in to read photos and PDFs. You can still import a CSV or paste text without signing in.');
  const base64 = file.base64 ?? (file.uri ? await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' }) : '');
  if (!base64) throw new Error('That file could not be read.');
  const { data, error } = await supabase.functions.invoke('extract-document', { body: { mimeType: file.mimeType, base64, hint: kind } });
  if (error) throw new Error('The document reader is not available right now. Try again later.');
  if (!data || typeof data.text !== 'string')
    throw new Error(typeof data?.error === 'string' ? data.error : 'The document reader returned nothing.');
  return parseExtractionJson(data.text, new Date().getFullYear());
}
