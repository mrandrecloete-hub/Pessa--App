import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { initLedger } from '@/stores/ledger';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const { c, isDark } = useTheme();
  useEffect(() => {
    void initLedger();
  }, []);
  const modal = (title: string) => ({ title, presentation: 'modal' as const });
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: '' }} />
        <Stack.Screen name="add" options={modal('Add transaction')} />
        <Stack.Screen name="scan" options={modal('Scan or upload')} />
        <Stack.Screen name="import" options={modal('Import')} />
        <Stack.Screen name="goal-new" options={modal('New goal')} />
        <Stack.Screen name="reports" options={{ title: 'Reports' }} />
        <Stack.Screen name="budget" options={{ title: 'Budget' }} />
      </Stack>
    </>
  );
}
