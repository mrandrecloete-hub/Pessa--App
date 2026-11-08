import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { format } from '@moneva/shared';
import { Body, Caption, Card, Chip, EmptyState, Field, H1, Screen } from '@/components/ui';
import { categoryName } from '@/lib/categories';
import { categoryIcon } from '@/lib/icons';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Filter = 'all' | 'income' | 'expense';

export default function Transactions() {
  const { c } = useTheme();
  const { transactions, deleteTransaction } = useLedger();
  const base = usePrefs((s) => s.baseCurrency);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((x) => filter === 'all' || (filter === 'income' ? x.type === 'income' || x.type === 'refund' : x.type === 'expense'))
      .filter((x) => !t || `${x.description ?? ''} ${x.merchant ?? ''} ${categoryName(x.categoryId)}`.toLowerCase().includes(t));
  }, [transactions, q, filter]);

  const confirmDelete = (id: string) =>
    Alert.alert('Delete transaction?', 'This removes it from your balances and reports.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(id) },
    ]);

  return (
    <Screen>
      <H1>Transaction History</H1>
      <Field label="Search" value={q} onChangeText={setQ} placeholder="Search transactions" />
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {(['all', 'income', 'expense'] as Filter[]).map((f) => (
          <Chip
            key={f}
            label={f === 'all' ? 'All' : f === 'income' ? 'Income' : 'Expenses'}
            on={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      {list.length === 0 ? (
        <EmptyState
          title={transactions.length ? 'No matches' : 'No transactions yet'}
          message={
            transactions.length ? 'Try a different search or filter.' : 'Use the + button to add one, or scan a receipt or statement.'
          }
        />
      ) : (
        list.map((t) => {
          const out = t.type === 'expense' || t.type === 'transfer_out';
          return (
            <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: c.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: space.md,
                }}
              >
                <Ionicons name={categoryIcon(t.categoryId)} size={20} color={out ? c.negative : c.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: space.sm }}>
                <Text style={[type.heading, { color: c.text }]} numberOfLines={1}>
                  {t.description || categoryName(t.categoryId)}
                </Text>
                <Caption>
                  {t.date} · {categoryName(t.categoryId)}
                  {t.source !== 'manual' ? ` · ${t.source}` : ''}
                </Caption>
              </View>
              <Text style={[type.heading, { color: out ? c.negative : c.positive }]}>
                {out ? '-' : '+'}
                {format(t.amount, base)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${t.description || categoryName(t.categoryId)}`}
                onPress={() => confirmDelete(t.id)}
                style={{ padding: space.sm, marginLeft: 4 }}
              >
                <Ionicons name="trash-outline" size={18} color={c.textMuted} />
              </Pressable>
            </Card>
          );
        })
      )}
      {list.length > 0 && <Body muted>Deleting a transaction updates your balance and reports at once.</Body>}
    </Screen>
  );
}
