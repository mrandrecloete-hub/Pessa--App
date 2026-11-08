import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { Extraction } from '@moneva/shared';
import { PayslipReview, ReceiptReview, StatementReview } from '@/components/review';
import { Body, Button, Caption, Card, H1, Screen } from '@/components/ui';
import { extractDocument, type ExtractKind, type PickedFile } from '@/lib/extract';
import { space, type } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

const KINDS: Array<{ kind: ExtractKind; title: string; sub: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { kind: 'receipt', title: 'Receipt', sub: 'Merchant, date and total', icon: 'receipt-outline' },
  { kind: 'payslip', title: 'Payslip', sub: 'Net pay recorded as income', icon: 'document-text-outline' },
  { kind: 'bank_statement', title: 'Bank statement', sub: 'Every line, categorised', icon: 'card-outline' },
];

export default function Scan() {
  const { c } = useTheme();
  const [kind, setKind] = useState<ExtractKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Extraction | null>(null);
  const [done, setDone] = useState('');

  const run = async (file: PickedFile) => {
    if (!kind) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await extractDocument(file, kind));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const fromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Camera permission is needed to photograph a document. You can choose a file instead.');
    const r = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, mediaTypes: ['images'] });
    const a = r.canceled ? null : r.assets[0];
    if (a?.base64) await run({ base64: a.base64, mimeType: a.mimeType ?? 'image/jpeg' });
  };
  const fromLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, mediaTypes: ['images'] });
    const a = r.canceled ? null : r.assets[0];
    if (a?.base64) await run({ base64: a.base64, mimeType: a.mimeType ?? 'image/jpeg' });
  };
  const fromFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    if (a) await run({ uri: a.uri, mimeType: a.mimeType ?? 'application/pdf' });
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
            Photograph or upload a document. MONEVA reads it, shows you what it found, and saves nothing until you confirm.
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
                <Caption>Works offline and without an account</Caption>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </Card>
          </Pressable>
        </>
      )}
      {kind && !result && (
        <>
          <Body muted style={{ marginBottom: space.md }}>
            {KINDS.find((k) => k.kind === kind)?.title}: use a flat, well lit, sharp photo, or a PDF. Files up to about 5 MB.
          </Body>
          {busy ? (
            <Card style={{ alignItems: 'center' }}>
              <ActivityIndicator color={c.primary} />
              <Body muted style={{ marginTop: space.sm }}>
                Reading your document...
              </Body>
            </Card>
          ) : (
            <View style={{ gap: space.sm }}>
              <Button title="Take a photo" onPress={fromCamera} />
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
              {error.includes('CSV') || error.includes('Sign in') ? (
                <View style={{ marginTop: space.sm }}>
                  <Button title="Import CSV or text instead" variant="ghost" onPress={() => router.replace('/import')} />
                </View>
              ) : null}
            </Card>
          )}
        </>
      )}
      {result && (
        <View>
          <Card>
            <Caption>
              Document type found: {result.documentType.replace('_', ' ')} · reading confidence {Math.round(result.confidence * 100)}%
            </Caption>
            {result.documentType !== kind && (
              <Body style={{ color: c.warning }}>This does not look like the type you chose. Check carefully before saving.</Body>
            )}
          </Card>
          {kind === 'receipt' &&
            (result.receipt ? (
              <ReceiptReview receipt={result.receipt} warnings={result.warnings} />
            ) : (
              <Card>
                <Body>No receipt data was found.</Body>
              </Card>
            ))}
          {kind === 'payslip' &&
            (result.payslip ? (
              <PayslipReview slip={result.payslip} />
            ) : (
              <Card>
                <Body>No payslip data was found.</Body>
              </Card>
            ))}
          {kind === 'bank_statement' && (
            <>
              {result.warnings.map((w) => (
                <Caption key={w}>{w}</Caption>
              ))}
              <StatementReview rows={result.rows} onDone={setDone} />
            </>
          )}
          <View style={{ height: space.md }} />
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
