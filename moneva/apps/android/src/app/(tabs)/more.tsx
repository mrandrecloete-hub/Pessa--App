import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { CURRENCIES } from '@moneva/shared';
import { Body, Caption, Card, Chip, H1, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { IconName } from '@/lib/icons';
import { useLedger } from '@/stores/ledger';
import { usePrefs, type ThemeMode } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const NOT_BUILT: Array<[string, string]> = [
  ['Accounts and wallets', 'Stage 3'],
  ['Bills and subscriptions', 'Stage 4'],
  ['Debt management', 'Stage 4'],
  ['AI financial assistant', 'Stage 8'],
  ['Bank connections', 'Stage 7'],
  ['Currency rates', 'Stage 6'],
  ['Notifications', 'Stage 9'],
  ['PIN and biometric lock', 'Stage 10'],
];

function Row({ icon, title, sub, href }: { icon: IconName; title: string; sub: string; href: Href }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(href)}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
        <Ionicons name={icon} size={24} color={c.primary} style={{ marginRight: space.md }} />
        <View style={{ flex: 1 }}>
          <Text style={[type.heading, { color: c.text }]}>{title}</Text>
          <Caption>{sub}</Caption>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
      </Card>
    </Pressable>
  );
}

export default function More() {
  const { c } = useTheme();
  const { themeMode, setThemeMode, baseCurrency, setBaseCurrency, userName, setUserName } = usePrefs();
  const hasData = useLedger((s) => s.transactions.length > 0);
  const session = useSession();
  void userName;
  void setUserName;
  return (
    <Screen>
      <H1>More</H1>
      <Row icon="scan-outline" title="Scan or upload" sub="Receipts, payslips and bank statements" href="/scan" />
      <Row icon="bar-chart-outline" title="Financial reports" sub="Income, spending and categories" href="/reports" />
      <Row icon="pie-chart-outline" title="Budget" sub="Monthly limit, alerts and forecast" href="/budget" />
      <Card>
        <Caption>Account</Caption>
        {session ? (
          <View style={{ marginTop: space.sm }}>
            <Body>{session.user.email}</Body>
            <View style={{ height: space.sm }} />
            <Chip label="Sign out" on={false} onPress={() => supabase?.auth.signOut()} />
          </View>
        ) : (
          <View style={{ marginTop: space.sm }}>
            <Chip label="Sign in or create account" on={false} onPress={() => router.push('/login')} />
          </View>
        )}
      </Card>
      <Card>
        <Caption>Appearance</Caption>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          {(['dark', 'light', 'system'] as ThemeMode[]).map((m) => (
            <Chip key={m} label={m} on={themeMode === m} onPress={() => setThemeMode(m)} />
          ))}
        </View>
        <View style={{ height: space.md }} />
        <Caption>
          {hasData ? 'Base currency (locked while you have transactions, until multi-currency in Stage 6)' : 'Base currency'}
        </Caption>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, opacity: hasData ? 0.45 : 1 }}
          pointerEvents={hasData ? 'none' : 'auto'}
        >
          {['NAD', 'ZAR', 'USD', 'EUR', 'GBP', 'BWP'].map((code) => (
            <Chip key={code} label={code} on={baseCurrency === code} onPress={() => setBaseCurrency(code)} />
          ))}
        </View>
        <Caption>{CURRENCIES[baseCurrency]?.name}</Caption>
      </Card>
      <Text style={[type.caption, { color: c.textMuted, marginBottom: space.sm }]}>Not built yet</Text>
      {NOT_BUILT.map(([name, stage]) => (
        <Card key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.md }}>
          <Body muted>{name}</Body>
          <Caption>{stage}</Caption>
        </Card>
      ))}
    </Screen>
  );
}
