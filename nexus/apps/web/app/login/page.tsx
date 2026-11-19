'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api';
import { Err, Field } from '@/components/ui';
export default function Login() {
  const r = useRouter(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [e, setE] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function go(ev: React.FormEvent) { ev.preventDefault(); setBusy(true); setE(null); try { await post('/auth/login', { email, password }); r.replace('/dashboard'); } catch (x: any) { setE(x.message); } setBusy(false); }
  return (<div className="auth"><form className="card stack" onSubmit={go}><div className="logo"><img src="/brand/logo-emblem.png" alt="NEXUS NAMIBIA" /><h1 style={{ marginTop: 8 }}>Welcome back</h1><div className="muted small">Empowering Enterprise. Connecting Capital. Building Namibia.</div></div>
    <Field id="em" label="Email address"><input id="em" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
    <Field id="pw" label="Password"><input id="pw" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
    <Err e={e} /><button className="btn gold" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p className="muted small" style={{ textAlign: 'center' }}>No account? <Link href="/register">Create one</Link></p></form></div>);
}
