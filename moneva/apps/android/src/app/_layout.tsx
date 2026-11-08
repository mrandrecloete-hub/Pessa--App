import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/useTheme';

export default function RootLayout() {
  const { c, isDark } = useTheme();
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
        <Stack.Screen name="add" options={{ title: 'Add transaction', presentation: 'modal' }} />
        <Stack.Screen name="import" options={{ title: 'Scan or import', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
