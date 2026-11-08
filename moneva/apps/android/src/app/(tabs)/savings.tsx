import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Alert } from 'react-native';
import { format, ratioPct, sub } from '@moneva/shared';
import { Body, Button, Caption, Card, EmptyState, Field, H1, ProgressBar, Screen } from '@/components/ui';
import { todayISO } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Savings() {
  const { c } = useTheme();
  const { goals, contribute, deleteGoal } = useLedger();
  const base = usePrefs((s) => s.baseCurrency);
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  return (
    <Screen>
      <H1>Savings Goals</H1>
      <Body muted style={{ marginBottom: space.md }}>
        These are your own savings targets. A contribution is a record you keep. It does not move money at a bank.
      </Body>
      {goals.length === 0 ? (
        <EmptyState title="No goals yet" message="Set a target such as an emergency fund, a car or a holiday." />
      ) : (
        goals.map((g) => {
          const pct = Math.min(100, Number(ratioPct(g.saved, g.target)));
          return (
            <Card key={g.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[type.heading, { color: c.text }]}>{g.name}</Text>
                <Text style={[type.heading, { color: c.primary }]}>{Math.round(pct)}%</Text>
              </View>
              <Body muted style={{ marginVertical: 6 }}>
                {format(g.saved, base)} / {format(g.target, base)}
              </Body>
              <ProgressBar percent={pct} />
              <Caption>
                {Number(sub(g.target, g.saved)) > 0 ? `${format(sub(g.target, g.saved), base)} to go` : 'Goal reached'}
                {g.targetDate ? ` · due ${g.targetDate}` : ''}
              </Caption>
              {open === g.id ? (
                <View style={{ marginTop: space.md }}>
                  <Field
                    label={`Contribution (${base})`}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={(v) => {
                      setAmount(v);
                      setError('');
                    }}
                    placeholder="0.00"
                  />
                  {!!error && <Body style={{ color: c.negative, marginBottom: space.sm }}>{error}</Body>}
                  <Button
                    title="Add contribution"
                    onPress={() => {
                      const r = contribute(g.id, amount.replace(',', '.').trim(), todayISO());
                      if (r.ok) {
                        setAmount('');
                        setOpen(null);
                      } else setError(r.error);
                    }}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Contribute"
                      variant="ghost"
                      onPress={() => {
                        setOpen(g.id);
                        setError('');
                      }}
                    />
                  </View>
                  <View>
                    <Button
                      title="Remove"
                      variant="ghost"
                      onPress={() =>
                        Alert.alert('Remove goal?', 'The goal and its contribution history will be deleted.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => deleteGoal(g.id) },
                        ])
                      }
                    />
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}
      <Button title="Add goal" variant="gold" onPress={() => router.push('/goal-new')} />
      <View style={{ height: space.md }} />
      <Caption>Savings challenges and the discipline score are not built yet (Stage 5).</Caption>
    </Screen>
  );
}
