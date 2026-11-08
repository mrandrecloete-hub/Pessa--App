import { useColorScheme } from 'react-native';
import { usePrefs } from '@/stores/preferences';
import { dark, light, type Palette } from './tokens';

export function useTheme(): { c: Palette; isDark: boolean } {
  const system = useColorScheme();
  const mode = usePrefs((s) => s.themeMode);
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
  return { c: isDark ? dark : light, isDark };
}
