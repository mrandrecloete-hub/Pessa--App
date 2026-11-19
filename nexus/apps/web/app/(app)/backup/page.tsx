'use client';
import { useState } from 'react';
import { exportBackup, importBackup, wipeLocal, LOCAL } from '@/lib/local';
import { Err } from '@/components/ui';
import { disconnect } from '@/lib/cloud';
export default function Backup() {
  const [text, setText] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [e, setE] = useState<string | null>(null); const [confirmWipe, setConfirm] = useState(false);
  if (!LOCAL) return <div className="card">Your data is kept on the NEXUS server.</div>;
  async function copy() { const t = exportBackup(); setText(t); try { await navigator.clipboard.writeText(t); setMsg('Backup copied. Paste it into a note or message to yourself and keep it safe.'); } catch { setMsg('Select the text below and copy it.'); } }
  function restore() { setE(null); try { importBackup(text); setMsg('Backup restored. Open the Dashboard to see your data.'); } catch (x: any) { setE(x.message); } }
  return (<div className="stack"><h1>Backup and restore</h1><p className="muted">Everything you enter is stored only on this phone. If you uninstall the app or clear its data, it is gone. Make a backup now and then, and keep it somewhere safe. A backup contains your business details and plan text, so do not share it.</p>
    <div className="card stack"><h2>Make a backup</h2><div><button className="btn gold" onClick={copy}>Copy backup text</button></div></div>
    <div className="card stack"><h2>Restore from a backup</h2><textarea aria-label="Backup text" value={text} onChange={ev => setText(ev.target.value)} placeholder="Paste backup text here" /><div><button className="btn" onClick={restore} disabled={!text.trim()}>Restore (replaces what is on this device)</button></div></div>
    <Err e={e} />{msg && <p className="okmsg" role="status">{msg}</p>}
    <div className="card stack"><h2>Erase everything on this device</h2>{!confirmWipe ? <div><button className="btn ghost" onClick={() => setConfirm(true)}>Erase all my data…</button></div> : <div className="row"><span className="err">This cannot be undone.</span><button className="btn" style={{ background: 'var(--err)' }} onClick={() => { disconnect(); wipeLocal(); location.href = '/dashboard/'; }}>Yes, erase</button><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button></div>}</div></div>);
}
