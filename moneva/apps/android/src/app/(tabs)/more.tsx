import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { CURRENCIES } from '@moneva/shared';
import { Body, Caption, Card, H1, Screen } from '@/components/ui';
import { useLedger } from '@/stores/ledger';
import { usePrefs, type ThemeMode } from '@/stores/preferences';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const SECTIONS: Array<[string, string]> = [
  ['Financial reports', 'Stage 9'],
  ['Accounts and wallets', 'Stage 3'],
  ['Bills and subscriptions', 'Stage 4'],
  ['Debt management', 'Stage 4'],
  ['Financial goals', 'Stage 5'],
  ['AI financial assistant', 'Stage 8'],
  ['Notifications', 'Stage 9'],
  ['Security (PIN, biometrics)', 'Stage 10'],
];

export default function More() {
  const { c } = useTheme();
  const { themeMode, setThemeMode, baseCurrency, setBaseCurrency } = usePrefs();
  const hasData = useLedger((s) => s.transactions.length > 0);
  return (
    <Screen>
      <H1>More</H1>
      <Pressable accessibilityRole="button" onPress={() => router.push('/import')}>
        <Card>
          <Text style={[type.heading, { color: c.primary }]}>Scan or import documents</Text>
          <Caption>Bank statements (CSV or pasted text) and payslips. Working now.</Caption>
        </Card>
      </Pressable>
      <Card>
        <Caption>Appearance</Caption>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ selected: themeMode === m }}
              onPress={() => setThemeMode(m)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: themeMode === m ? c.primary : c.surfaceAlt,
              }}
            >
              <Text style={[type.caption, { color: themeMode === m ? c.primaryText : c.text }]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: space.md }} />
        <Caption>
          {hasData ? 'Base currency (locked while you have transactions, until multi-currency in Stage 6)' : 'Base currency'}
        </Caption>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          {['NAD', 'ZAR', 'USD', 'EUR', 'GBP', 'BWP'].map((code) => (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityLabel={CURRENCIES[code]?.name}
              accessibilityState={{ selected: baseCurrency === code }}
              disabled={hasData}
              onPress={() => setBaseCurrency(code)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                backgroundColor: baseCurrency === code ? c.primary : c.surfaceAlt,
                opacity: hasData && baseCurrency !== code ? 0.4 : 1,
              }}
            >
              <Text style={[type.caption, { color: baseCurrency === code ? c.primaryText : c.text }]}>{code}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Caption>Not built yet</Caption>
      {SECTIONS.map(([name, stage]) => (
        <Card key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.md }}>
          <Body>{name}</Body>
          <Caption>{stage}</Caption>
        </Card>
      ))}
    </Screen>
  );
}
