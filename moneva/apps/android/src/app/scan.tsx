import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import {
  parsePayslip,
  parseReceiptText,
  parseStatementText,
  rowsToPairs,
  rowsToText,
  type PayslipResult,
  type RawStatementRow,
  type ReceiptData,
} from '@moneva/shared';
import { PayslipReview, ReceiptReview, StatementReview } from '@/components/review';
import { Body, Button, Caption, Card, H1, Screen } from '@/components/ui';
import { readImageRows, readPdfRows, scanDocumentRows } from '@/lib/ocr';
import { usePrefs } from '@/stores/preferences';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Kind = 'receipt' | 'payslip' | 'bank_statement' | 'text';
type Result =
  | { kind: 'receipt'; receipt: ReceiptData; warnings: string[]; confidence: number; text: string }
  | { kind: 'payslip'; slip: PayslipResult; text: string }
  | { kind: 'bank_statement'; rows: RawStatementRow[]; unread: number; text: string }
  | { kind: 'text'; text: string };

const KINDS: Array<{ kind: Kind; title: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { kind: 'receipt', title: 'Receipt', sub: 'Shop, date and total', icon: 'receipt-outline' },
  { kind: 'payslip', title: 'Payslip', sub: 'Net pay recorded as income', icon: 'document-text-outline' },
  { kind: 'bank_statement', title: 'Bank statement', sub: 'Every line, categorised', icon: 'card-outline' },
  { kind: 'text', title: 'Any document to text', sub: 'Scan any page and copy its text', icon: 'scan-outline' },
];

/** How many pages the scanner allows in one go, per document type. */
const PAGE_LIMIT: Record<Kind, number> = { receipt: 2, payslip: 3, bank_statement: 12, text: 12 };

/** Turns the rows read on the phone into reviewable data. Nothing is saved here. */
function interpret(kind: Kind, rows: string[][], base: string): Result {
  const year = new Date().getFullYear();
  if (kind === 'text') return { kind, text: rows.map((r) => r.join('  ')).join('\n') };
  if (kind === 'receipt') {
    const text = rowsToPairs(rows);
    const r = parseReceiptText(text, year);
    return {
      kind,
      receipt: { merchant: r.merchant, date: r.date, total: r.total, currency: base },
      warnings: r.warnings,
      confidence: r.confidence,
      text,
    };
  }
  if (kind === 'payslip') {
    const text = rowsToPairs(rows);
    return { kind, slip: parsePayslip(text), text };
  }
  const text = rowsToText(rows);
  const s = parseStatementText(text, year);
  return { kind, rows: s.rows, unread: s.unreadLines.length, text };
}

export default function Scan() {
  const { c } = useTheme();
  const base = usePrefs((s) => s.baseCurrency);
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [showText, setShowText] = useState(false);
  const [done, setDone] = useState('');
  const [copied, setCopied] = useState(false);

  const read = async (load: () => Promise<string[][] | null>) => {
    if (!kind) return;
    setError('');
    setResult(null);
    setShowText(false);
    setCopied(false);
    setBusy('Reading your document on this phone...');
    try {
      const rows = await load();
      if (rows === null) return; // cancelled
      if (rows.length === 0) throw new Error('No text was found. Use a sharp, well lit photo with the whole page in view.');
      const r = interpret(kind, rows, base);
      setResult(r);
      // When nothing useful was found, show what the phone read so the person can see why (and send it to us).
      setShowText(
        (r.kind === 'bank_statement' && r.rows.length === 0) ||
          (r.kind === 'receipt' && !r.receipt.total) ||
          (r.kind === 'payslip' && !r.slip.net),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The document could not be read.');
    } finally {
      setBusy('');
    }
  };

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Camera permission is needed to photograph a document. You can choose a photo or PDF instead.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.9, mediaTypes: ['images'] });
    const a = r.canceled ? null : r.assets[0];
    if (a) await read(() => readImageRows(a.uri));
  };
  const scan = async () => {
    if (!kind) return;
    let scannerFailed = false;
    await read(async () => {
      try {
        return await scanDocumentRows(PAGE_LIMIT[kind], (i, n) => setBusy(`Reading page ${i + 1} of ${n} on this phone...`));
      } catch {
        scannerFailed = true;
        return null;
      }
    });
    // Scanner unavailable on this phone (it needs Google Play services): use the plain camera instead.
    if (scannerFailed) await fromCamera();
  };
  const fromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ['images'] });
    const a = r.canceled ? null : r.assets[0];
    if (a) await read(() => readImageRows(a.uri));
  };
  const fromFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    if (!a) return;
    const isPdf = (a.mimeType ?? '').includes('pdf') || a.name.toLowerCase().endsWith('.pdf');
    await read(() =>
      isPdf ? readPdfRows(a.uri, (i, n) => setBusy(`Reading page ${i + 1} of ${n} on this phone...`)) : readImageRows(a.uri),
    );
  };

  if (done)
    return (
      <Screen>
        <H1>Done</H1>
        <Card>
          <Body>{done}</Body>
        </Card>
        <Button title="Back to MONEVA" onPress={() => router.back()} />
      </Screen>
    );

  return (
    <Screen>
      <H1>Scan or upload</H1>
      {!kind && (
        <>
          <Body muted style={{ marginBottom: space.md }}>
            Photograph or upload a document. MONEVA reads it on this phone, shows you what it found, and saves nothing until you confirm.
            Nothing is uploaded.
          </Body>
          {KINDS.map((k) => (
            <Pressable
              key={k.kind}
              accessibilityRole="button"
              onPress={() => {
                setKind(k.kind);
                setError('');
                setResult(null);
              }}
            >
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={k.icon} size={26} color={c.primary} style={{ marginRight: space.md }} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.heading, { color: c.text }]}>{k.title}</Text>
                  <Caption>{k.sub}</Caption>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
              </Card>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => router.replace('/import')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="clipboard-outline" size={26} color={c.accent} style={{ marginRight: space.md }} />
              <View style={{ flex: 1 }}>
                <Text style={[type.heading, { color: c.text }]}>CSV file or pasted text</Text>
                <Caption>For exported statements</Caption>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </Card>
          </Pressable>
        </>
      )}

      {kind && !result && (
        <>
          <Body muted style={{ marginBottom: space.md }}>
            {KINDS.find((k) => k.kind === kind)?.title}: lay it flat in good light and fill the frame. A PDF from your bank or employer
            reads best.
          </Body>
          {busy ? (
            <Card style={{ alignItems: 'center' }}>
              <ActivityIndicator color={c.primary} />
              <Body muted style={{ marginTop: space.sm }}>
                {busy}
              </Body>
            </Card>
          ) : (
            <View style={{ gap: space.sm }}>
              <Button title="Scan with camera" onPress={scan} />
              <Caption>Finds the page edges, crops and straightens it. Several pages in one go.</Caption>
              <Button title="Choose a photo" variant="ghost" onPress={fromLibrary} />
              <Button title="Choose a PDF or file" variant="ghost" onPress={fromFile} />
              <Button
                title="Back"
                variant="ghost"
                onPress={() => {
                  setKind(null);
                  setError('');
                }}
              />
            </View>
          )}
          {!!error && (
            <Card style={{ marginTop: space.md }}>
              <Body style={{ color: c.warning }}>{error}</Body>
            </Card>
          )}
        </>
      )}

      {result && (
        <View>
          {result.kind === 'receipt' && (
            <>
              <Card>
                <Caption>Read on this phone · confidence {Math.round(result.confidence * 100)}%. Check every field.</Caption>
              </Card>
              <ReceiptReview receipt={result.receipt} warnings={result.warnings} />
            </>
          )}
          {result.kind === 'payslip' && <PayslipReview slip={result.slip} />}
          {result.kind === 'text' && (
            <Card>
              <Caption>Text read on this phone. Press and hold to select part of it.</Caption>
              <Text selectable style={[type.body, { color: c.text, marginTop: space.sm }]}>
                {result.text}
              </Text>
            </Card>
          )}
          {result.kind === 'bank_statement' && (
            <>
              {result.unread > 0 && (
                <Card>
                  <Body style={{ color: c.warning }}>
                    {result.unread} line(s) had a date but no readable amount and were left out. Compare with your statement.
                  </Body>
                </Card>
              )}
              <StatementReview rows={result.rows} onDone={setDone} />
            </>
          )}
          <View style={{ height: space.md }} />
          <Button
            title={copied ? 'Copied' : 'Copy all the text'}
            variant="ghost"
            onPress={async () => {
              await Clipboard.setStringAsync(result.text);
              setCopied(true);
            }}
          />
          {result.kind !== 'text' && (
            <>
              <View style={{ height: space.sm }} />
              <Button
                title={showText ? 'Hide the text that was read' : 'Show the text that was read'}
                variant="ghost"
                onPress={() => setShowText((v) => !v)}
              />
            </>
          )}
          {showText && (
            <Card style={{ marginTop: space.sm }}>
              <Caption>
                This is exactly what the phone read. Press and hold to select and copy it. Sending it to the MONEVA team helps us read your
                bank's layout.
              </Caption>
              <Text selectable style={[type.caption, { color: c.text, fontFamily: 'monospace', marginTop: space.sm }]}>
                {result.text}
              </Text>
            </Card>
          )}
          <View style={{ height: space.sm }} />
          <Button
            title="Scan a different document"
            variant="ghost"
            onPress={() => {
              setResult(null);
              setKind(null);
            }}
          />
        </View>
      )}
    </Screen>
  );
}
