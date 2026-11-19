'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api';
import { Err, Field } from '@/components/ui';
export default function Register() {
  const r = useRouter(); const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '' }); const [e, setE] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value });
  async function go(ev: React.FormEvent) { ev.preventDefault(); setBusy(true); setE(null); try { await post('/auth/register', f); r.replace('/business'); } catch (x: any) { setE(x.message); } setBusy(false); }
  return (<div className="auth"><form className="card stack" onSubmit={go}><div className="logo"><img src="/brand/logo-emblem.png" alt="NEXUS NAMIBIA" /><h1 style={{ marginTop: 8 }}>Create your account</h1></div>
    <div className="grid g2"><Field id="fn" label="First name"><input id="fn" required value={f.firstName} onChange={set('firstName')} /></Field><Field id="ln" label="Last name"><input id="ln" required value={f.lastName} onChange={set('lastName')} /></Field></div>
    <Field id="em" label="Email address"><input id="em" type="email" autoComplete="email" required value={f.email} onChange={set('email')} /></Field>
    <Field id="pw" label="Password (10 or more characters, with a letter and a number)"><input id="pw" type="password" autoComplete="new-password" minLength={10} required value={f.password} onChange={set('password')} /></Field>
    <Err e={e} /><button className="btn gold" disabled={busy} style={{ width: '100%' }}>{busy ? 'Creating…' : 'Create account'}</button>
    <p className="muted small">NEXUS is an independent technology product. It does not approve funding and is not a lender or a government body.</p>
    <p className="muted small" style={{ textAlign: 'center' }}>Already registered? <Link href="/login">Sign in</Link></p></form></div>);
}
