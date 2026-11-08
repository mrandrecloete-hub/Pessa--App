import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Caption, Chip, Field, H1, Screen } from '@/components/ui';
import { CATEGORIES } from '@/lib/categories';
import { todayISO } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function AddTransaction() {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const add = useLedger((s) => s.addTransaction);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('groceries');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const save = () => {
    const r = add(
      {
        type: kind,
        amount: amount.replace(',', '.').trim(),
        currency: base,
        accountId: 'main',
        categoryId: category,
        date,
        description: description.trim() || undefined,
      },
      base,
    );
    if (!r.ok) return setError(r.error);
    router.back();
  };

  return (
    <Screen>
      <H1>Add Transaction</H1>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Chip
          label="Income"
          on={kind === 'income'}
          onPress={() => {
            setKind('income');
            setCategory('salary');
          }}
        />
        <Chip
          label="Expense"
          on={kind === 'expense'}
          onPress={() => {
            setKind('expense');
            setCategory('groceries');
          }}
        />
      </View>
      <Field
        label={`Amount (${base})`}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setError('');
        }}
        placeholder="0.00"
        style={{ fontSize: 26, fontWeight: '700' }}
      />
      <Caption>Category</Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.sm, marginBottom: space.md }}>
        {CATEGORIES.filter((x) => x.kind === kind).map((x) => (
          <Chip key={x.id} label={x.name} on={category === x.id} onPress={() => setCategory(x.id)} />
        ))}
      </View>
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} />
      {!!error && <Body style={{ color: c.negative, marginBottom: space.md }}>{error}</Body>}
      <Button title="Save Transaction" variant="gold" onPress={save} />
    </Screen>
  );
}
