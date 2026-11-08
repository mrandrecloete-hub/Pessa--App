import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, Caption, H1, Screen } from '@/components/ui';
import { CATEGORIES } from '@/lib/categories';
import { todayISO } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { radius, space, type } from '@/theme/tokens';
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

  const input = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: space.md,
    color: c.text,
    backgroundColor: c.surface,
    marginBottom: space.md,
  } as const;
  const chip = (on: boolean) => ({
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: on ? c.primary : c.surfaceAlt,
  });

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
      <H1>{kind === 'expense' ? 'New expense' : 'New income'}</H1>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {(['expense', 'income'] as const).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === k }}
            onPress={() => {
              setKind(k);
              setCategory(k === 'income' ? 'salary' : 'groceries');
            }}
            style={chip(kind === k)}
          >
            <Text style={[type.caption, { color: kind === k ? c.primaryText : c.text }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <Caption>Amount ({base})</Caption>
      <TextInput
        accessibilityLabel="Amount"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => {
          setAmount(v);
          setError('');
        }}
        placeholder="0.00"
        placeholderTextColor={c.textMuted}
        style={[input, type.title]}
      />
      <Caption>Category</Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.sm, marginBottom: space.md }}>
        {CATEGORIES.filter((x) => x.kind === kind).map((x) => (
          <Pressable
            key={x.id}
            accessibilityRole="button"
            accessibilityState={{ selected: category === x.id }}
            onPress={() => setCategory(x.id)}
            style={chip(category === x.id)}
          >
            <Text style={[type.caption, { color: category === x.id ? c.primaryText : c.text }]}>{x.name}</Text>
          </Pressable>
        ))}
      </View>
      <Caption>Date (YYYY-MM-DD)</Caption>
      <TextInput accessibilityLabel="Date" value={date} onChangeText={setDate} style={input} placeholderTextColor={c.textMuted} />
      <Caption>Description (optional)</Caption>
      <TextInput
        accessibilityLabel="Description"
        value={description}
        onChangeText={setDescription}
        style={input}
        placeholderTextColor={c.textMuted}
      />
      {!!error && <Body style={{ color: c.negative, marginBottom: space.md }}>{error}</Body>}
      <Button title="Save" onPress={save} />
    </Screen>
  );
}
