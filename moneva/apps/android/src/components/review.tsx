import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  buildCandidates,
  categorise,
  format,
  summariseCandidates,
  type ImportCandidate,
  type PayslipResult,
  type RawStatementRow,
  type ReceiptData,
} from '@moneva/shared';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { todayISO } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Body, Button, Caption, Card, Chip, Field } from './ui';

interface Override {
  categoryId?: string;
  direction?: 'in' | 'out';
}

/** Review rows read from a statement. Nothing is saved until the user confirms; uncertain rows stay out. */
export function StatementReview({ rows, onDone }: { rows: RawStatementRow[]; onDone: (message: string) => void }) {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const { importedFingerprints, importCandidates } = useLedger();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [open, setOpen] = useState<string | null>(null);

  const candidates: ImportCandidate[] = useMemo(
    () =>
      buildCandidates('main', rows, new Set(importedFingerprints)).map((cd) => {
        const o = overrides[cd.fingerprint];
        if (!o) return cd;
        const direction = o.direction ?? cd.direction;
        return { ...cd, direction, categoryId: o.categoryId ?? cd.categoryId, confidence: 1, needsReview: direction === 'unknown' };
      }),
    [rows, overrides, importedFingerprints],
  );
  const summary = useMemo(() => summariseCandidates(candidates), [candidates]);
  const ready = candidates.filter((x) => !x.duplicate && !x.needsReview);

  if (candidates.length === 0)
    return (
      <Card>
        <Body>No transactions could be read. Check that each line has a date and an amount.</Body>
      </Card>
    );
  return (
    <View>
      <Card>
        <Caption>Would be imported</Caption>
        <Text style={[type.title, { color: c.positive }]}>Income {format(summary.income, base)}</Text>
        <Text style={[type.title, { color: c.negative }]}>Spent {format(summary.expenses, base)}</Text>
        <Caption>
          {summary.counted} rows · {summary.needsReview} need review · {summary.duplicatesSkipped} duplicates
        </Caption>
      </Card>
      {candidates.map((x) => (
        <Pressable key={x.fingerprint} onPress={() => setOpen(open === x.fingerprint ? null : x.fingerprint)}>
          <Card style={{ paddingVertical: space.md, opacity: x.duplicate ? 0.45 : 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[type.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {x.description || '(no description)'}
              </Text>
              <Text style={[type.heading, { color: x.direction === 'in' ? c.positive : x.direction === 'out' ? c.negative : c.warning }]}>
                {x.direction === 'unknown' ? '?' : x.direction === 'in' ? '+' : '-'}
                {format(x.amount, base)}
              </Text>
            </View>
            <Caption>
              {x.date} · {categoryName(x.categoryId)}
              {x.duplicate ? ' · duplicate, skipped' : x.needsReview ? ' · needs your confirmation' : ''}
            </Caption>
            {open === x.fingerprint && !x.duplicate && (
              <View style={{ marginTop: space.sm }}>
                <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
                  {(['in', 'out'] as const).map((d) => (
                    <Chip
                      key={d}
                      label={d === 'in' ? 'Money in' : 'Money out'}
                      on={x.direction === d}
                      onPress={() =>
                        setOverrides((o) => ({
                          ...o,
                          [x.fingerprint]: {
                            ...o[x.fingerprint],
                            direction: d,
                            categoryId: o[x.fingerprint]?.categoryId ?? (d === 'in' ? 'other_income' : x.categoryId),
                          },
                        }))
                      }
                    />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {CATEGORIES.filter((k) => k.kind === (x.direction === 'in' ? 'income' : 'expense')).map((k) => (
                    <Chip
                      key={k.id}
                      label={k.name}
                      on={x.categoryId === k.id}
                      onPress={() => setOverrides((o) => ({ ...o, [x.fingerprint]: { ...o[x.fingerprint], categoryId: k.id } }))}
                    />
                  ))}
                </View>
              </View>
            )}
          </Card>
        </Pressable>
      ))}
      <Button
        title={`Import ${ready.length} confirmed rows`}
        disabled={ready.length === 0}
        onPress={() => {
          const r = importCandidates('main', ready, base);
          onDone(
            `Imported ${r.added} transactions. ${summary.needsReview} left out for review, ${summary.duplicatesSkipped} duplicates skipped.`,
          );
        }}
      />
      <Caption>Tap a row to correct it. Rows that need confirmation stay out until you do.</Caption>
    </View>
  );
}

/** Review a payslip. Only net pay is income; deductions are shown but never recorded as expenses. */
export function PayslipReview({ slip }: { slip: PayslipResult }) {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const addScannedIncome = useLedger((s) => s.addScannedIncome);
  const [net, setNet] = useState(slip.net ?? '');
  const [error, setError] = useState('');
  return (
    <View>
      <Card>
        <Caption>
          {slip.employer ?? 'Employer not found'} · {slip.period ?? 'period not found'}
        </Caption>
        <Body>Gross: {slip.gross ? format(slip.gross, base) : 'not found'}</Body>
        {slip.deductions.map((d, i) => (
          <Body key={i} muted>
            {d.label || d.kind}: {format(d.amount, base)}
          </Body>
        ))}
        <Caption>Deductions are not recorded as expenses. Only the net pay is income received.</Caption>
        {slip.checks.map((k, i) => (
          <Body key={i} style={{ color: k.ok ? c.positive : c.warning, marginTop: space.xs }}>
            {k.message}
          </Body>
        ))}
        <Caption>Reading confidence {Math.round(slip.confidence * 100)}%. Please check the net pay.</Caption>
      </Card>
      <Field
        label={`Net pay (${base})`}
        keyboardType="decimal-pad"
        value={net}
        onChangeText={(v) => {
          setNet(v.replace(',', '.'));
          setError('');
        }}
      />
      {!!error && <Body style={{ color: c.negative, marginBottom: space.sm }}>{error}</Body>}
      <Button
        title={/^\d+(\.\d+)?$/.test(net) ? `Record ${format(net, base)} as income` : 'Record income'}
        onPress={() => {
          if (!/^\d+(\.\d+)?$/.test(net) || Number(net) <= 0) return setError('Enter the net pay as a number.');
          addScannedIncome({
            accountId: 'main',
            amount: net,
            date: slip.period ? `${slip.period}-28` : todayISO(),
            description: `Salary${slip.employer ? ` ${slip.employer}` : ''}`,
            baseCurrency: base,
          });
          router.back();
        }}
      />
    </View>
  );
}

/** Review a receipt. The user must confirm merchant, date, amount and category before it is saved. */
export function ReceiptReview({ receipt, warnings }: { receipt: ReceiptData; warnings: string[] }) {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const add = useLedger((s) => s.addTransaction);
  const [merchant, setMerchant] = useState(receipt.merchant);
  const [amount, setAmount] = useState(receipt.total ?? '');
  const [date, setDate] = useState(receipt.date ?? todayISO());
  const guess = categorise(receipt.merchant, 'out');
  const [category, setCategory] = useState(guess.categoryId);
  const [error, setError] = useState('');
  const foreign = receipt.currency && receipt.currency !== base;
  return (
    <View>
      {warnings.map((w) => (
        <Card key={w}>
          <Body style={{ color: c.warning }}>{w}</Body>
        </Card>
      ))}
      {foreign && (
        <Card>
          <Body style={{ color: c.warning }}>
            This receipt is in {receipt.currency}, but your base currency is {base}. Foreign currency needs an exchange rate, which arrives
            in Stage 6. Convert it yourself and enter the {base} amount below.
          </Body>
        </Card>
      )}
      <Field label="Merchant" value={merchant} onChangeText={setMerchant} />
      <Field
        label={`Total (${base})`}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => {
          setAmount(v.replace(',', '.'));
          setError('');
        }}
      />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <Caption>Category{guess.confidence < 0.75 ? ' (not sure, please choose)' : ''}</Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: space.sm }}>
        {CATEGORIES.filter((k) => k.kind === 'expense').map((k) => (
          <Chip key={k.id} label={k.name} on={category === k.id} onPress={() => setCategory(k.id)} />
        ))}
      </View>
      {!!error && <Body style={{ color: c.negative, marginBottom: space.sm }}>{error}</Body>}
      <Button
        title="Confirm and save expense"
        onPress={() => {
          const r = add(
            {
              type: 'expense',
              amount,
              currency: base,
              accountId: 'main',
              categoryId: category,
              date,
              description: merchant.trim() || undefined,
              merchant: merchant.trim() || undefined,
            },
            base,
            'scan',
          );
          if (!r.ok) return setError(r.error);
          router.back();
        }}
      />
    </View>
  );
}
