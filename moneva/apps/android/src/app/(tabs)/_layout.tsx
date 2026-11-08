import { Ionicons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import { Pressable, View, type ColorValue } from 'react-native';
import { usePrefs, usePrefsHydrated } from '@/stores/preferences';
import { useTheme } from '@/theme/useTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const tab = (title: string, icon: IconName, focused: IconName) => ({
  title,
  tabBarIcon: ({ color, focused: f, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={f ? focused : icon} size={size} color={color as string} />
  ),
});

function CenterAdd() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => router.push('/add')}
        style={({ pressed }) => ({
          top: -18,
          width: 62,
          height: 62,
          borderRadius: 31,
          backgroundColor: c.primary,
          borderWidth: 4,
          borderColor: c.bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="add" size={34} color={c.primaryText} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  const hydrated = usePrefsHydrated();
  const onboarded = usePrefs((s) => s.onboarded);
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!onboarded) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopColor: c.border, height: 66, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home-outline', 'home')} />
      <Tabs.Screen name="transactions" options={tab('Transactions', 'swap-horizontal-outline', 'swap-horizontal')} />
      <Tabs.Screen name="add-tab" options={{ title: 'Add', tabBarButton: () => <CenterAdd /> }} />
      <Tabs.Screen name="savings" options={tab('Savings', 'leaf-outline', 'leaf')} />
      <Tabs.Screen name="more" options={tab('More', 'grid-outline', 'grid')} />
      <Tabs.Screen name="budget" options={{ href: null }} />
    </Tabs>
  );
}
