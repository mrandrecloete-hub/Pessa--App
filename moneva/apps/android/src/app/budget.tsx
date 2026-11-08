import { useState } from 'react';
import { Text } from 'react-native';
import { budgetStatus, forecastMonth, format, periodSummary, suggestBudget, type BudgetMethod } from '@moneva/shared';
import { Body, Button, Caption, Card, Chip, Field, H1, ProgressBar, Screen } from '@/components/ui';
import { monthRange } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { View } from 'react-native';

const ALERT_TEXT = {
  none: 'On track',
  progress: 'More than half of your budget is used',
  warning: 'Warning: 75% used',
  strong: 'Strong warning: 90% used',
  exceeded: 'Budget exceeded',
} as const;

export default function Budget() {
  const { c } = useTheme();
  const { baseCurrency: base, monthlyBudget, setMonthlyBudget } = usePrefs();
  const txs = useLedger((s) => s.transactions);
  const [method, setMethod] = useState<Exclude<BudgetMethod, 'custom'>>('50/30/20');
  const [input, setInput] = useState(monthlyBudget ?? '');
  const [error, setError] = useState('');
  const now = new Date();
  const { from, to, daysInMonth, daysElapsed } = monthRange(now);
  const { income, expenses } = periodSummary(txs, from, to);
  const status = monthlyBudget ? budgetStatus(monthlyBudget, expenses) : null;
  const fc = monthlyBudget ? forecastMonth(monthlyBudget, expenses, daysElapsed, daysInMonth) : null;

  const save = () => {
    const v = input.replace(',', '.').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(v) || Number(v) <= 0) return setError('Enter a budget above zero.');
    setMonthlyBudget(v);
    setError('');
  };

  return (
    <Screen>
      <H1>Budget Overview</H1>
      <Card>
        <Field
          label={`Monthly spending budget (${base})`}
          keyboardType="decimal-pad"
          value={input}
          onChangeText={(v) => {
            setInput(v);
            setError('');
          }}
          placeholder="e.g. 12000"
        />
        {!!error && <Body style={{ color: c.negative, marginBottom: space.sm }}>{error}</Body>}
        <Button title={monthlyBudget ? 'Update budget' : 'Save budget'} onPress={save} />
      </Card>
      {status && fc && (
        <Card>
          <Text style={[type.title, { color: c.text }]}>{Math.round(Number(status.percentUsed))}% used</Text>
          <View style={{ marginVertical: space.sm }}>
            <ProgressBar
              percent={Number(status.percentUsed)}
              color={
                status.alert === 'exceeded' || status.alert === 'strong' ? c.negative : status.alert === 'warning' ? c.warning : c.primary
              }
            />
          </View>
          <Body>
            Spent {format(status.spent, base)} of {format(status.allocated, base)}
          </Body>
          <Body muted>Remaining {format(status.remaining, base)}</Body>
          <Body style={{ marginTop: space.sm, color: status.alert === 'none' ? c.positive : c.warning }}>{ALERT_TEXT[status.alert]}</Body>
          <Caption>
            {fc.basis === 'insufficient-data'
              ? 'A forecast needs at least 3 days of data this month.'
              : `At this pace you will spend about ${format(fc.projectedSpend, base)} by month end${fc.willExceed ? ', which is over your budget.' : '.'} This is an estimate from your own spending so far.`}
          </Caption>
        </Card>
      )}
      <H1>Suggested split</H1>
      <Body muted style={{ marginBottom: space.md }}>
        Based on income you have received this month. A starting point, not a rule.
      </Body>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {(['50/30/20', '60/20/20'] as const).map((m) => (
          <Chip key={m} label={m} on={method === m} onPress={() => setMethod(m)} />
        ))}
      </View>
      {Number(income) <= 0 ? (
        <Body muted>Record your salary or scan a payslip to see a suggestion.</Body>
      ) : (
        suggestBudget(income, base, method).map((b) => (
          <Card key={b.key} style={{ paddingVertical: space.md }}>
            <Caption>
              {b.label} · {b.percent}%
            </Caption>
            <Text style={[type.title, { color: c.text }]}>{format(b.amount, base)}</Text>
          </Card>
        ))
      )}
      <Caption>Notifications for budget alerts are not built yet. Alerts show here and on Home.</Caption>
    </Screen>
  );
}
