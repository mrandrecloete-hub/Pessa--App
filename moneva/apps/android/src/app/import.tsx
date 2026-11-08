import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  buildCandidates,
  format,
  parsePayslip,
  parseStatementCsv,
  parseStatementText,
  summariseCandidates,
  type ImportCandidate,
} from '@moneva/shared';
import { Body, Button, Caption, Card, H1, Screen } from '@/components/ui';
import { CATEGORIES, categoryName } from '@/lib/categories';
import { todayISO } from '@/lib/dates';
import { useLedger } from '@/stores/ledger';
import { usePrefs } from '@/stores/preferences';
import { radius, space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Mode = 'statement' | 'payslip';
interface Override {
  categoryId?: string;
  direction?: 'in' | 'out';
}

export default function ImportScreen() {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const { importedFingerprints, importCandidates, addScannedIncome } = useLedger();
  const [mode, setMode] = useState<Mode>('statement');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [netEdit, setNetEdit] = useState('');

  const chip = (on: boolean) => ({
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: on ? c.primary : c.surfaceAlt,
  });
  const input = {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: space.md,
    color: c.text,
    backgroundColor: c.surface,
    marginBottom: space.md,
  } as const;

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/plain', 'text/comma-separated-values', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets[0]) return;
    try {
      setText(await (await fetch(r.assets[0].uri)).text());
      setParsed(false);
      setMessage('');
    } catch {
      setMessage('That file could not be read. Try pasting its text instead.');
    }
  };

  const year = new Date().getFullYear();
  const candidates: ImportCandidate[] = useMemo(() => {
    if (!parsed || mode !== 'statement') return [];
    const csv = parseStatementCsv(text, year);
    const rows = csv.rows.length ? csv.rows : parseStatementText(text, year).rows;
    return buildCandidates('main', rows, new Set(importedFingerprints)).map((cd) => {
      const o = overrides[cd.fingerprint];
      if (!o) return cd;
      const direction = o.direction ?? cd.direction;
      return { ...cd, direction, categoryId: o.categoryId ?? cd.categoryId, confidence: 1, needsReview: direction === 'unknown' };
    });
  }, [parsed, mode, text, overrides, importedFingerprints, year]);

  const summary = useMemo(() => summariseCandidates(candidates), [candidates]);
  const slip = useMemo(() => (parsed && mode === 'payslip' ? parsePayslip(text) : null), [parsed, mode, text]);
  const net = netEdit.trim() || slip?.net;

  const saveStatement = () => {
    const ok = candidates.filter((x) => !x.duplicate && !x.needsReview);
    const r = importCandidates('main', ok, base);
    setMessage(
      `Imported ${r.added} transactions. ${summary.needsReview} left out for review, ${summary.duplicatesSkipped} duplicates skipped.`,
    );
    setParsed(false);
    setText('');
  };
  const savePayslip = () => {
    if (!net || !/^\d+(\.\d+)?$/.test(net)) return setMessage('Enter the net pay as a number.');
    const date = slip?.period ? `${slip.period}-28` : todayISO();
    addScannedIncome({
      accountId: 'main',
      amount: net,
      date,
      description: `Salary${slip?.employer ? ` ${slip.employer}` : ''}`,
      baseCurrency: base,
    });
    router.back();
  };

  return (
    <Screen>
      <H1>Scan or import</H1>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        {(['statement', 'payslip'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
            onPress={() => {
              setMode(m);
              setParsed(false);
              setMessage('');
            }}
            style={chip(mode === m)}
          >
            <Text style={[type.caption, { color: mode === m ? c.primaryText : c.text }]}>
              {m === 'statement' ? 'Bank statement' : 'Payslip'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Body muted style={{ marginBottom: space.md }}>
        Import a CSV file or paste statement or payslip text. Reading text from photos and PDFs (OCR) is not built yet: it needs the Stage 9
        server function. Nothing is saved until you confirm.
      </Body>
      <Button title="Choose CSV or text file" variant="ghost" onPress={pick} />
      <View style={{ height: space.md }} />
      <TextInput
        accessibilityLabel="Document text"
        multiline
        value={text}
        onChangeText={(v) => {
          setText(v);
          setParsed(false);
        }}
        placeholder="Or paste the text here"
        placeholderTextColor={c.textMuted}
        style={[input, { minHeight: 120, textAlignVertical: 'top' }]}
      />
      <Button
        title="Read document"
        onPress={() => {
          setParsed(true);
          setMessage('');
        }}
        disabled={!text.trim()}
      />
      {!!message && (
        <Card style={{ marginTop: space.md }}>
          <Body>{message}</Body>
        </Card>
      )}

      {parsed &&
        mode === 'statement' &&
        (candidates.length === 0 ? (
          <Card style={{ marginTop: space.md }}>
            <Body>
              No transactions could be read. Check that the text has a date and an amount on each line, or that the CSV has Date and Amount
              (or Debit and Credit) columns.
            </Body>
          </Card>
        ) : (
          <View style={{ marginTop: space.lg }}>
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
                    <Text
                      style={[type.heading, { color: x.direction === 'in' ? c.positive : x.direction === 'out' ? c.negative : c.warning }]}
                    >
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
                          <Pressable
                            key={d}
                            accessibilityRole="button"
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
                            style={chip(x.direction === d)}
                          >
                            <Text style={[type.caption, { color: x.direction === d ? c.primaryText : c.text }]}>
                              {d === 'in' ? 'Money in' : 'Money out'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {CATEGORIES.filter((k) => k.kind === (x.direction === 'in' ? 'income' : 'expense')).map((k) => (
                          <Pressable
                            key={k.id}
                            accessibilityRole="button"
                            onPress={() => setOverrides((o) => ({ ...o, [x.fingerprint]: { ...o[x.fingerprint], categoryId: k.id } }))}
                            style={chip(x.categoryId === k.id)}
                          >
                            <Text style={[type.caption, { color: x.categoryId === k.id ? c.primaryText : c.text }]}>{k.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </Card>
              </Pressable>
            ))}
            <Button
              title={`Import ${candidates.filter((x) => !x.duplicate && !x.needsReview).length} confirmed rows`}
              onPress={saveStatement}
              disabled={candidates.every((x) => x.duplicate || x.needsReview)}
            />
            <Caption>Tap a row to correct it. Rows that need confirmation stay out until you do.</Caption>
          </View>
        ))}

      {slip && (
        <View style={{ marginTop: space.lg }}>
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
          <Caption>Net pay ({base})</Caption>
          <TextInput
            accessibilityLabel="Net pay"
            keyboardType="decimal-pad"
            value={netEdit || slip.net || ''}
            onChangeText={setNetEdit}
            style={input}
            placeholderTextColor={c.textMuted}
          />
          <Button title={net ? `Record ${format(net, base)} as income` : 'Record income'} onPress={savePayslip} disabled={!net} />
        </View>
      )}
    </Screen>
  );
}
