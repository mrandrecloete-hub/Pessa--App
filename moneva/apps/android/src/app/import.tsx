import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { parsePayslip, parseStatementCsv, parseStatementText } from '@moneva/shared';
import { PayslipReview, StatementReview } from '@/components/review';
import { Body, Button, Card, Chip, Field, H1, Screen } from '@/components/ui';
import { space } from '@/theme/tokens';

type Mode = 'statement' | 'payslip';

/** Offline import: a CSV file or pasted text. No account or network needed. */
export default function ImportScreen() {
  const [mode, setMode] = useState<Mode>('statement');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(false);
  const [message, setMessage] = useState('');
  const year = new Date().getFullYear();

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

  const rows = useMemo(() => {
    if (!parsed || mode !== 'statement') return [];
    const csv = parseStatementCsv(text, year);
    return csv.rows.length ? csv.rows : parseStatementText(text, year).rows;
  }, [parsed, mode, text, year]);
  const slip = useMemo(() => (parsed && mode === 'payslip' ? parsePayslip(text) : null), [parsed, mode, text]);

  return (
    <Screen>
      <H1>Import a CSV or paste text</H1>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.md }}>
        <Chip
          label="Bank statement"
          on={mode === 'statement'}
          onPress={() => {
            setMode('statement');
            setParsed(false);
            setMessage('');
          }}
        />
        <Chip
          label="Payslip"
          on={mode === 'payslip'}
          onPress={() => {
            setMode('payslip');
            setParsed(false);
            setMessage('');
          }}
        />
      </View>
      <Body muted style={{ marginBottom: space.md }}>
        Choose a CSV file or paste text copied from your statement or payslip. Nothing is saved until you confirm.
      </Body>
      <Button title="Choose CSV or text file" variant="ghost" onPress={pick} />
      <View style={{ height: space.md }} />
      <Field
        label="Document text"
        multiline
        value={text}
        onChangeText={(v) => {
          setText(v);
          setParsed(false);
        }}
        placeholder="Or paste the text here"
        style={{ minHeight: 120, textAlignVertical: 'top' }}
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
      {parsed && mode === 'statement' && (
        <View style={{ marginTop: space.lg }}>
          <StatementReview
            rows={rows}
            onDone={(m) => {
              setMessage(m);
              setParsed(false);
              setText('');
            }}
          />
        </View>
      )}
      {slip && (
        <View style={{ marginTop: space.lg }}>
          <PayslipReview slip={slip} />
        </View>
      )}
    </Screen>
  );
}
