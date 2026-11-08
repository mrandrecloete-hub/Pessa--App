import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * Session tokens are kept in expo-secure-store (Android Keystore backed).
 * Only the public anon key is used here. RLS protects every row.
 */
const secureStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);
export const supabase = supabaseConfigured
  ? createClient(url!, anon!, { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;
