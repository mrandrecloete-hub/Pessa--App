import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { format } from '@moneva/shared';
import { Body, Caption, Card, EmptyState, H1, Screen } from '@/components/ui';
import { categoryName } from '@/lib/categories';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

export default function Transactions() {
  const { c } = useTheme();
  const { transactions, deleteTransaction } = useLedger();
  const base = usePrefs((s) => s.baseCurrency);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((x) => !t || `${x.description ?? ''} ${x.merchant ?? ''} ${categoryName(x.categoryId)}`.toLowerCase().includes(t));
  }, [transactions, q]);

  return (
    <Screen>
      <H1>Transactions</H1>
      <TextInput
        accessibilityLabel="Search transactions"
        placeholder="Search"
        placeholderTextColor={c.textMuted}
        value={q}
        onChangeText={setQ}
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius.md,
          padding: space.md,
          color: c.text,
          backgroundColor: c.surface,
          marginBottom: space.md,
        }}
      />
      {list.length === 0 ? (
        <EmptyState
          title={transactions.length ? 'No matches' : 'No transactions yet'}
          message={transactions.length ? 'Try a different search.' : 'Use the + button to add one, or scan a statement from More.'}
        />
      ) : (
        list.map((t) => (
          <Pressable
            key={t.id}
            accessibilityLabel={`${t.description || categoryName(t.categoryId)}, ${format(t.amount, t.currency)}. Long press to delete`}
            onLongPress={() =>
              Alert.alert('Delete transaction?', 'This removes it from your balances and reports.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(t.id) },
              ])
            }
          >
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.md }}>
              <View style={{ flex: 1, paddingRight: space.md }}>
                <Text style={[type.heading, { color: c.text }]} numberOfLines={1}>
                  {t.description || categoryName(t.categoryId)}
                </Text>
                <Caption>
                  {t.date} · {categoryName(t.categoryId)}
                  {t.source !== 'manual' ? ` · ${t.source}` : ''}
                </Caption>
              </View>
              <Text style={[type.heading, { color: t.type === 'expense' || t.type === 'transfer_out' ? c.negative : c.positive }]}>
                {t.type === 'expense' || t.type === 'transfer_out' ? '-' : '+'}
                {format(t.amount, base)}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
      {list.length > 0 && <Body muted>Long press a transaction to delete it.</Body>}
    </Screen>
  );
}
