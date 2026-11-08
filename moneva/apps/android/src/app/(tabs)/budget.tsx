import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { format, periodSummary, suggestBudget, type BudgetMethod } from '@moneva/shared';
import { Body, Caption, Card, EmptyState, H1, Screen } from '@/components/ui';
import { monthRange } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Budget() {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const txs = useLedger((s) => s.transactions);
  const [method, setMethod] = useState<Exclude<BudgetMethod, 'custom'>>('50/30/20');
  const { from, to } = monthRange();
  const { income } = periodSummary(txs, from, to);

  return (
    <Screen>
      <H1>Budget</H1>
      <Body muted style={{ marginBottom: space.md }}>
        A suggestion based on income you have actually received this month. It is a starting point, not a rule.
      </Body>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {(['50/30/20', '60/20/20'] as const).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: method === m }}
            onPress={() => setMethod(m)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: radius.pill,
              backgroundColor: method === m ? c.primary : c.surfaceAlt,
            }}
          >
            <Text style={[type.caption, { color: method === m ? c.primaryText : c.text }]}>{m}</Text>
          </Pressable>
        ))}
      </View>
      {Number(income) <= 0 ? (
        <EmptyState
          title="No income recorded this month"
          message="Record your salary or scan a payslip and a suggested allocation appears here."
        />
      ) : (
        suggestBudget(income, base, method).map((b) => (
          <Card key={b.key}>
            <Caption>
              {b.label} · {b.percent}%
            </Caption>
            <Text style={[type.title, { color: c.text }]}>{format(b.amount, base)}</Text>
          </Card>
        ))
      )}
      <Caption>Category budgets, alerts and forecasts arrive in Stage 4. Nothing here is saved yet.</Caption>
    </Screen>
  );
}
