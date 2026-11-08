import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  budgetStatus,
  dailyBalanceSeries,
  forecastMonth,
  format,
  periodSummary,
  ratioPct,
  spendingByCategory,
  sum,
  accountBalance,
} from '@moneva/shared';
import { Donut, Ring, Sparkline } from '@/components/charts';
import { Logo } from '@/components/Logo';
import { Body, Button, Caption, Card, EmptyState, ProgressBar, Screen } from '@/components/ui';
import { categoryName } from '@/lib/categories';
import { monthRange } from '@/lib/dates';
import { SLICE_COLORS } from '@/lib/icons';
import { buildInsights } from '@/lib/insights';
import { pctChange, previousMonth } from '@/lib/stats';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

function Change({ value, good }: { value: string | null; good: 'up' | 'down' }) {
  const { c } = useTheme();
  if (value === null) return <Caption>no last month data</Caption>;
  const up = Number(value) >= 0;
  const isGood = good === 'up' ? up : !up;
  return (
    <Text style={[type.caption, { color: isGood ? c.positive : c.negative }]}>
      {up ? '▲' : '▼'} {value}%
    </Text>
  );
}

function Tile({
  icon,
  label,
  value,
  children,
  tint,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  children: React.ReactNode;
  tint: string;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.surface,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={18} color="#04120F" />
      </View>
      <Caption>{label}</Caption>
      <Text style={[type.heading, { color: c.text, marginVertical: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {children}
    </View>
  );
}

export default function Home() {
  const { c } = useTheme();
  const { accounts, transactions, goals, saveError } = useLedger();
  const { baseCurrency: base, monthlyBudget, userName } = usePrefs();
  const [hidden, setHidden] = useState(false);
  const now = new Date();
  const { from, to } = monthRange(now);
  const prev = monthRange(previousMonth(now));
  const s = periodSummary(transactions, from, to);
  const ps = periodSummary(transactions, prev.from, prev.to);
  const opening = sum(accounts.map((a) => a.opening));
  const balance = sum(accounts.map((a) => accountBalance(a.opening, transactions, a.id)));
  const series = dailyBalanceSeries(opening, transactions, from, to.slice(0, 8) + String(now.getDate()).padStart(2, '0'));
  const lastMonthEnd = dailyBalanceSeries(opening, transactions, prev.to, prev.to)[0]?.balance ?? '0';
  const balChange = pctChange(balance, lastMonthEnd);
  const saved = sum(goals.map((g) => g.saved));
  const goalTarget = sum(goals.map((g) => g.target));
  const insights = buildInsights(transactions, from, to, base, prev);
  const cats = Object.entries(spendingByCategory(transactions, from, to))
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const top = cats.slice(0, 4),
    rest = sum(cats.slice(4).map(([, v]) => v));
  const slices = [
    ...top.map(([k, v], i) => ({ key: k, name: categoryName(k), value: Number(v), amount: v, color: SLICE_COLORS[i]! })),
    ...(Number(rest) > 0 ? [{ key: 'rest', name: 'Others', value: Number(rest), amount: rest, color: SLICE_COLORS[4]! }] : []),
  ];
  const bs = monthlyBudget ? budgetStatus(monthlyBudget, s.expenses) : null;
  const fc = monthlyBudget ? forecastMonth(monthlyBudget, s.expenses, now.getDate(), monthRange(now).daysInMonth) : null;
  const whole = (v: string) => format(v, base).replace(/\.00$/, '');
  const mask = (v: string) => (hidden ? `${format('0', base).replace('0.00', '')}••••` : v);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.lg }}>
        <Logo size={46} />
        <View style={{ marginLeft: space.md, flex: 1 }}>
          <Text style={[type.title, { color: c.text, letterSpacing: 1 }]}>MONEVA</Text>
          <Text style={[type.caption, { color: c.primary }]}>Take Control. Build Wealth.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan a receipt or document"
          onPress={() => router.push('/scan')}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="scan-outline" size={20} color={c.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
          onPress={() => router.push('/more')}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: c.primary,
            marginLeft: space.sm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[type.heading, { color: c.primaryText }]}>{(userName.trim()[0] ?? 'M').toUpperCase()}</Text>
        </Pressable>
      </View>

      {saveError && (
        <Card>
          <Body style={{ color: c.negative }}>
            Your last change could not be saved to this phone and may be lost if you close the app. {saveError}
          </Body>
        </Card>
      )}

      <Card style={{ overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[type.heading, { color: c.text }]}>Total Balance</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
            onPress={() => setHidden((h) => !h)}
          >
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={c.textMuted} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <View style={{ flexShrink: 1 }}>
            <Text
              accessibilityLabel={hidden ? 'Balance hidden' : `Total balance ${format(balance, base)}`}
              style={[type.display, { color: c.text, fontSize: 30, marginTop: 4 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {mask(format(balance, base))}
            </Text>
            {transactions.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Change value={balChange} good="up" />
                <Caption>vs last month end</Caption>
              </View>
            )}
          </View>
          <Sparkline values={series.map((p) => Number(p.balance))} width={130} height={56} color={c.primary} fill={c.primary} />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Tile icon="arrow-down" label="Income" value={mask(whole(s.income))} tint={c.primary}>
          <Change value={pctChange(s.income, ps.income)} good="up" />
        </Tile>
        <Tile icon="arrow-up" label="Expenses" value={mask(whole(s.expenses))} tint={c.negative}>
          <Change value={pctChange(s.expenses, ps.expenses)} good="down" />
        </Tile>
        <Tile icon="leaf" label="Savings" value={mask(whole(saved))} tint={c.accent}>
          {Number(goalTarget) > 0 ? (
            <Caption>{Math.round(Number(ratioPct(saved, goalTarget)))}% of goals</Caption>
          ) : (
            <Caption>no goals yet</Caption>
          )}
        </Tile>
      </View>

      {transactions.length === 0 && (
        <EmptyState
          title="Nothing recorded yet"
          message="Add income and expenses, or scan a receipt, payslip or bank statement. Every figure here comes from your own records."
          action={<Button title="Scan or import" onPress={() => router.push('/scan')} />}
        />
      )}

      <Pressable accessibilityRole="button" onPress={() => router.push('/budget')}>
        <Card>
          {bs ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
              <Ring
                percent={Number(bs.percentUsed)}
                color={bs.alert === 'exceeded' || bs.alert === 'strong' ? c.negative : bs.alert === 'warning' ? c.warning : c.primary}
                track={c.surfaceAlt}
              >
                <Text style={[type.heading, { color: c.text }]}>{Math.round(Number(bs.percentUsed))}%</Text>
              </Ring>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[type.heading, { color: c.text }]}>Budget Progress</Text>
                  <Text
                    style={[
                      type.caption,
                      { color: (bs.alert === 'none' || bs.alert === 'progress') && !fc?.willExceed ? c.positive : c.warning },
                    ]}
                  >
                    {bs.alert === 'exceeded'
                      ? 'Over budget'
                      : bs.alert === 'strong' || bs.alert === 'warning' || fc?.willExceed
                        ? 'Watch it'
                        : 'On track'}
                  </Text>
                </View>
                <Body muted style={{ marginVertical: 6 }}>
                  {format(bs.spent, base)} / {format(bs.allocated, base)}
                </Body>
                <ProgressBar percent={Number(bs.percentUsed)} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={[type.heading, { color: c.text }]}>Budget Progress</Text>
              <Body muted>Set a monthly budget to see how much of it you have used.</Body>
            </View>
          )}
        </Card>
      </Pressable>

      {insights[0] && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Ionicons name="bulb-outline" size={26} color={c.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { color: c.accent }]}>Smart Insight</Text>
            <Body>{insights[0]}</Body>
          </View>
        </Card>
      )}

      <Card>
        <Text style={[type.heading, { color: c.text, marginBottom: space.md }]}>Spending Breakdown · This month</Text>
        {slices.length === 0 ? (
          <Body muted>No spending recorded this month.</Body>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <Donut slices={slices} track={c.surfaceAlt} />
            <View style={{ flex: 1, gap: 6 }}>
              {slices.map((x) => (
                <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: x.color, marginRight: 8 }} />
                  <Text style={[type.caption, { color: c.text, flex: 1 }]} numberOfLines={1}>
                    {x.name}
                  </Text>
                  <Text style={[type.caption, { color: c.textMuted }]}>
                    {Math.round(Number(ratioPct(x.amount, s.expenses)))}% {mask(format(x.amount, base))}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>
    </Screen>
  );
}
