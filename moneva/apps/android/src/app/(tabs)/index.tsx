import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { accountBalance, format, periodSummary, sum } from '@moneva/shared';
import { Logo } from '@/components/Logo';
import { Body, Button, Caption, Card, EmptyState, H1, Screen } from '@/components/ui';
import { buildInsights } from '@/lib/insights';
import { monthRange } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4 }}>
      <Caption>{label}</Caption>
      <Text style={[type.heading, { color: color ?? c.text }]}>{value}</Text>
    </View>
  );
}

export default function Home() {
  const { c } = useTheme();
  const { accounts, transactions } = useLedger();
  const base = usePrefs((s) => s.baseCurrency);
  const { from, to } = monthRange();
  const s = periodSummary(transactions, from, to);
  const balance = sum(accounts.map((a) => accountBalance(a.opening, transactions, a.id)));
  const insights = buildInsights(transactions, from, to, base);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg }}>
        <Logo size={44} />
        <View>
          <Text style={[type.title, { color: c.text }]}>MONEVA</Text>
          <Caption>Take Control. Build Wealth.</Caption>
        </View>
      </View>

      <Card style={{ backgroundColor: c.surface }}>
        <Caption>Available balance</Caption>
        <Text
          accessibilityLabel={`Available balance ${format(balance, base)}`}
          style={[type.display, { color: c.text, marginVertical: space.xs }]}
        >
          {format(balance, base)}
        </Text>
        <View style={{ marginTop: space.sm }}>
          <Stat label="Income this month" value={format(s.income, base)} color={c.positive} />
          <Stat label="Spent this month" value={format(s.expenses, base)} color={c.negative} />
          <Stat label="Net" value={format(s.net, base)} />
        </View>
      </Card>

      {transactions.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          message="Add income and expenses, or scan a bank statement or payslip. Every figure here comes from your own records."
          action={<Button title="Scan or import" onPress={() => router.push('/import')} />}
        />
      ) : (
        <>
          <H1>Insights</H1>
          {insights.length === 0 ? (
            <Body muted>Not enough data for an insight yet.</Body>
          ) : (
            insights.map((t) => (
              <Card key={t}>
                <Body>{t}</Body>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
