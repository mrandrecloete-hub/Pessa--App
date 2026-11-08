import { router } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Field, H1, Screen } from '@/components/ui';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function NewGoal() {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const addGoal = useLedger((s) => s.addGoal);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  return (
    <Screen>
      <H1>New savings goal</H1>
      <Field label="Goal name" value={name} onChangeText={setName} placeholder="Emergency fund" />
      <Field
        label={`Target amount (${base})`}
        keyboardType="decimal-pad"
        value={target}
        onChangeText={(v) => setTarget(v.replace(',', '.'))}
        placeholder="20000"
      />
      <Field label="Target date (optional, YYYY-MM-DD)" value={date} onChangeText={setDate} />
      {!!error && <Body style={{ color: c.negative, marginBottom: space.md }}>{error}</Body>}
      <Button
        title="Save goal"
        variant="gold"
        onPress={() => {
          const r = addGoal({ name, target: target.trim(), targetDate: date.trim() || undefined });
          if (r.ok) router.back();
          else setError(r.error);
        }}
      />
    </Screen>
  );
}
