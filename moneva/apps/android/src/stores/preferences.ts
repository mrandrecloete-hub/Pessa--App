import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'system' | 'light' | 'dark';
interface Prefs {
  themeMode: ThemeMode;
  baseCurrency: string;
  setThemeMode: (m: ThemeMode) => void;
  setBaseCurrency: (c: string) => void;
}
export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      themeMode: 'system',
      baseCurrency: 'NAD',
      setThemeMode: (themeMode) => set({ themeMode }),
      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
    }),
    { name: 'moneva-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
