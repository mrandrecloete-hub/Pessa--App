'use client';
import { useEffect, useState } from 'react';
import { LOCAL, isDirty } from '@/lib/local';
import { connect, disconnect, getCfg, resolveConflict, syncNow, CloudCfg } from '@/lib/cloud';
import { Err, Field } from '@/components/ui';
export default function Cloud() {
  const [cfg, setCfg] = useState<CloudCfg | null>(null); const [f, setF] = useState({ server: '', email: '', password: '', first: '', last: '' }); const [create, setCreate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null); const [e, setE] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const refresh = () => { setCfg(getCfg()); setDirty(isDirty()); };
  useEffect(() => { refresh(); window.addEventListener('nexus-sync', refresh); return () => window.removeEventListener('nexus-sync', refresh); }, []);
  if (!LOCAL) return <div className="card">Your data is already kept on the NEXUS server.</div>;
  const set = (k: string) => (ev: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: ev.target.value });
  async function doConnect(ev: React.FormEvent) { ev.preventDefault(); setBusy(true); setE(null); setMsg(null);
    try { await connect(f.server, f.email, f.password, create, f.first, f.last); setF({ ...f, password: '' }); const r = await syncNow(); setMsg(r.message); if (r.status === 'error' || r.status === 'offline') setE(r.message); } catch (x: any) { setE(x.message); } setBusy(false); refresh(); }
  async function doSync() { setBusy(true); setE(null); const r = await syncNow(); (r.status === 'error' || r.status === 'offline' ? setE : setMsg)(r.message); setBusy(false); refresh(); }
  async function resolve(c: 'device' | 'cloud') { setBusy(true); setE(null); const r = await resolveConflict(c); (r.status === 'error' || r.status === 'offline' ? setE : setMsg)(r.message); setBusy(false); refresh(); }
  return (<div className="stack"><h1>Cloud sync</h1>
    <p className="muted">Your data lives on this phone. Connect to a NEXUS server to keep a backup copy in the cloud and use the same data on another device. Only connect to a server you trust: it will hold your business details and plan text.</p>
    {!cfg ? <form className="card stack" onSubmit={doConnect}><h2>{create ? 'Create a cloud account' : 'Sign in to the cloud'}</h2>
      <Field id="server" label="Server address (https://…)"><input id="server" type="url" required placeholder="https://nexus.example.na" value={f.server} onChange={set('server')} /></Field>
      {create && <div className="grid g2"><Field id="first" label="First name"><input id="first" required value={f.first} onChange={set('first')} /></Field><Field id="last" label="Last name"><input id="last" required value={f.last} onChange={set('last')} /></Field></div>}
      <Field id="cemail" label="Email address"><input id="cemail" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
      <Field id="cpw" label={create ? 'Password (10 or more characters, with a letter and a number)' : 'Password'}><input id="cpw" type="password" required minLength={create ? 10 : 1} autoComplete={create ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} /></Field>
      <Err e={e} /><div className="row"><button className="btn gold" disabled={busy}>{busy ? 'Connecting…' : create ? 'Create account and sync' : 'Sign in and sync'}</button><button type="button" className="btn ghost" onClick={() => setCreate(!create)}>{create ? 'I already have an account' : 'Create a new account'}</button></div></form>
    : <div className="stack">
      <div className="card stack"><h2>Connected</h2><div className="small">Server: {cfg.server}</div><div className="small">Account: {cfg.email}</div><div className="small">Cloud copy number: {cfg.revision}</div>
        <div className="small">Last synced: {cfg.lastSyncAt ? new Date(cfg.lastSyncAt).toLocaleString('en-ZA') : 'not yet'}</div><div className="small">Changes not yet in the cloud: {dirty ? <span className="badge warn">Yes</span> : <span className="badge ok">None</span>}</div>
        <div className="row"><button className="btn gold" onClick={doSync} disabled={busy || !!cfg.conflict}>{busy ? 'Syncing…' : 'Sync now'}</button><button className="btn ghost" onClick={() => { disconnect(); refresh(); setMsg('Disconnected. Your data on this phone is unchanged.'); }}>Disconnect</button></div>
        <p className="muted small">Sync runs by itself a few seconds after you change something, and when the app opens, if you are online.</p></div>
      {cfg.conflict && <div className="card stack" style={{ borderColor: 'var(--gold)' }}><h2>Choose which copy to keep</h2><p>Both this phone and the cloud have changes the other does not have. Nothing has been overwritten. The copy you do not keep is lost, so back it up first if unsure (Backup page).</p>
        <div className="row"><button className="btn gold" disabled={busy} onClick={() => resolve('device')}>Keep this phone (replace the cloud copy)</button><button className="btn" disabled={busy} onClick={() => resolve('cloud')}>Use the cloud copy (replace this phone)</button></div></div>}
      <Err e={e} /></div>}
    {msg && <p className="okmsg" role="status">{msg}</p>}</div>);
}
