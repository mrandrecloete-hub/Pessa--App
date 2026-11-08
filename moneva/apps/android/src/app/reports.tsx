import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { format, periodSummary, ratioPct, spendingByCategory } from '@moneva/shared';
import { Bars } from '@/components/charts';
import { Body, Caption, Card, EmptyState, H1, Screen } from '@/components/ui';
import { categoryName } from '@/lib/categories';
import { monthRange } from '@/lib/dates';
import { categoryIcon } from '@/lib/icons';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Reports() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const txs = useLedger((s) => s.transactions);
  const base = usePrefs((s) => s.baseCurrency);
  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(new Date().getFullYear(), new Date().getMonth() - (5 - i), 15);
        const r = monthRange(d);
        const s = periodSummary(txs, r.from, r.to);
        return { label: d.toLocaleString('en', { month: 'short' }), ...r, income: s.income, expenses: s.expenses };
      }),
    [txs],
  );
  const now = monthRange();
  const cats = Object.entries(spendingByCategory(txs, now.from, now.to))
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const total = months[5]!.expenses;

  return (
    <Screen>
      <H1>Financial Reports</H1>
      {txs.length === 0 ? (
        <EmptyState title="No data for reports" message="Reports are built from your recorded transactions." />
      ) : (
        <>
          <Card>
            <Text style={[type.heading, { color: c.text, marginBottom: space.md }]}>Income and spending, last 6 months</Text>
            <Bars
              label="Income and spending by month"
              width={width - space.lg * 4}
              a={c.primary}
              b={c.negative}
              data={months.map((m) => ({ label: m.label, a: Number(m.income), b: Number(m.expenses) }))}
            />
            <Caption>Green is income received, red is spending. Transfers and savings goals are not counted as spending.</Caption>
          </Card>
          <Card>
            <Text style={[type.heading, { color: c.text, marginBottom: space.md }]}>By category · this month</Text>
            {cats.length === 0 ? (
              <Body muted>No spending this month.</Body>
            ) : (
              cats.map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                  <Ionicons name={categoryIcon(k)} size={18} color={c.primary} style={{ marginRight: 10 }} />
                  <Text style={[type.body, { color: c.text, flex: 1 }]}>{categoryName(k)}</Text>
                  <Text style={[type.caption, { color: c.textMuted, marginRight: 10 }]}>{ratioPct(v, total)}%</Text>
                  <Text style={[type.heading, { color: c.text }]}>{format(v, base)}</Text>
                </View>
              ))
            )}
          </Card>
          <Caption>PDF, CSV and Excel export are not built yet (Stage 9).</Caption>
        </>
      )}
    </Screen>
  );
}
