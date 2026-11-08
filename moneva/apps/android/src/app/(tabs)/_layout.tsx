import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { Pressable, View, type ColorValue } from 'react-native';
import { useTheme } from '@/theme/useTheme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const tab = (title: string, icon: IconName, focused: IconName) => ({
  title,
  tabBarIcon: ({ color, focused: f, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={f ? focused : icon} size={size} color={color as string} />
  ),
});

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.primary,
          tabBarInactiveTintColor: c.textMuted,
          tabBarStyle: { backgroundColor: c.tabBar, borderTopColor: c.border, height: 64, paddingBottom: 8, paddingTop: 6 },
          tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="index" options={tab('Home', 'home-outline', 'home')} />
        <Tabs.Screen name="transactions" options={tab('Transactions', 'swap-vertical-outline', 'swap-vertical')} />
        <Tabs.Screen name="budget" options={tab('Budget', 'pie-chart-outline', 'pie-chart')} />
        <Tabs.Screen name="savings" options={tab('Savings', 'leaf-outline', 'leaf')} />
        <Tabs.Screen name="more" options={tab('More', 'ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle')} />
      </Tabs>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => router.push('/add')}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 20,
          bottom: 84,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        })}
      >
        <Ionicons name="add" size={32} color={c.primaryText} />
      </Pressable>
    </View>
  );
}
