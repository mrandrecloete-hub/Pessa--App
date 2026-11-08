import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';
interface Prefs {
  themeMode: ThemeMode;
  baseCurrency: string;
  onboarded: boolean;
  userName: string;
  /** Monthly spending limit in the base currency, chosen by the user. null = not set. */
  monthlyBudget: string | null;
  setThemeMode: (m: ThemeMode) => void;
  setBaseCurrency: (c: string) => void;
  setOnboarded: (v: boolean) => void;
  setUserName: (n: string) => void;
  setMonthlyBudget: (b: string | null) => void;
}
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      themeMode: 'dark',
      baseCurrency: 'NAD',
      onboarded: false,
      userName: '',
      monthlyBudget: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setUserName: (userName) => set({ userName }),
      setMonthlyBudget: (monthlyBudget) => set({ monthlyBudget }),
    }),
    { name: 'moneva-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** True once saved preferences have been read from the device, so screens do not flash defaults. */
export function usePrefsHydrated(): boolean {
  const [ok, setOk] = useState(usePrefs.persist.hasHydrated());
  useEffect(() => {
    const off = usePrefs.persist.onFinishHydration(() => setOk(true));
    setOk(usePrefs.persist.hasHydrated());
    return off;
  }, []);
  return ok;
}
