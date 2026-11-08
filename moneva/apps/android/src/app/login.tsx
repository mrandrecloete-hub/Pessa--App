import { router } from 'expo-router';
import { useState } from 'react';
import { signUpSchema } from '@moneva/shared';
import { Body, Button, Card, Field, H1, Screen } from '@/components/ui';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { usePrefs } from '@/stores/preferences';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** Email and password through Supabase Auth. Works only when EXPO_PUBLIC_SUPABASE_* are set. */
export default function Login() {
  const { c } = useTheme();
  const setOnboarded = usePrefs((s) => s.setOnboarded);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setError('');
    setInfo('');
    if (!supabase) return;
    const v = signUpSchema.safeParse({ email: email.trim(), password });
    if (mode === 'register' && !v.success) return setError(v.error.issues[0]?.message ?? 'Check your details.');
    if (mode === 'login' && (!email.trim() || !password)) return setError('Enter your email and password.');
    setBusy(true);
    const r =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (r.error) return setError(r.error.message);
    if (mode === 'register' && !r.data.session) return setInfo('Check your email and open the verification link, then sign in.');
    setOnboarded(true);
    router.replace('/');
  };
  const forgot = async () => {
    setError('');
    setInfo('');
    if (!supabase || !email.trim()) return setError('Enter your email first.');
    const r = await supabase.auth.resetPasswordForEmail(email.trim());
    if (r.error) return setError(r.error.message);
    setInfo('If that email has an account, a reset link has been sent.');
  };

  return (
    <Screen>
      <H1>{mode === 'login' ? 'Login' : 'Create account'}</H1>
      {!supabaseConfigured && (
        <Card>
          <Body style={{ color: c.warning }}>
            Online accounts are not set up in this build, so signing in is not possible yet. MONEVA still works fully on this device.
          </Body>
          <Button
            title="Continue on this device"
            onPress={() => {
              setOnboarded(true);
              router.replace('/');
            }}
          />
        </Card>
      )}
      <Field
        label="Email address"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        editable={supabaseConfigured}
      />
      <Field
        label="Password"
        secureTextEntry
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        value={password}
        onChangeText={setPassword}
        editable={supabaseConfigured}
      />
      {!!error && <Body style={{ color: c.negative, marginBottom: space.md }}>{error}</Body>}
      {!!info && <Body style={{ color: c.positive, marginBottom: space.md }}>{info}</Body>}
      <Button
        title={mode === 'login' ? 'Login' : 'Create account'}
        variant="gold"
        onPress={submit}
        loading={busy}
        disabled={!supabaseConfigured}
      />
      <Body muted style={{ marginTop: space.lg, textAlign: 'center' }}>
        {mode === 'login' ? 'New here? ' : 'Already have an account? '}
      </Body>
      <Button
        title={mode === 'login' ? 'Create account' : 'Login'}
        variant="ghost"
        onPress={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
        }}
      />
      {mode === 'login' && (
        <>
          <Body style={{ height: space.sm }}> </Body>
          <Button title="Forgot password?" variant="ghost" onPress={forgot} disabled={!supabaseConfigured} />
        </>
      )}
    </Screen>
  );
}
