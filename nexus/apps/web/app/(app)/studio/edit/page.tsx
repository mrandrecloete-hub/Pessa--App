'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { get, patch, ApiError } from '@/lib/api';
import { Bar } from '@/components/ui';
import { SECTION_COMPLETE_MIN_CHARS } from '@nexus/business-logic';
export default function Page() { return <Suspense fallback={<p className="muted">Loading…</p>}><Editor /></Suspense>; }
function Editor() {
  const id = useSearchParams().get('id') ?? ''; const [plan, setPlan] = useState<any>(null); const [key, setKey] = useState('EXECUTIVE_SUMMARY'); const [text, setText] = useState('');
  const [state, setState] = useState<'saved' | 'saving' | 'dirty' | 'conflict' | 'error'>('saved'); const [msg, setMsg] = useState(''); const timer = useRef<any>(null); const version = useRef(0);
  const load = async () => { const p = await get('/plans/' + id); setPlan(p); version.current = p.version; setText(p.sections[key]?.text ?? ''); setState('saved'); };
  useEffect(() => { load().catch(x => setMsg(x.message)); }, [id]); // eslint-disable-line
  const select = (k: string) => { if (state === 'dirty') flush(); setKey(k); setText(plan.sections[k]?.text ?? ''); };
  async function flush(snapshot = false) {
    clearTimeout(timer.current); setState('saving');
    try { const p = await patch(`/plans/${id}/sections/${key}`, { text, baseVersion: version.current, snapshot }); version.current = p.version; setPlan(p); setState('saved'); setMsg(snapshot ? 'Version saved.' : ''); }
    catch (x) { if (x instanceof ApiError && x.status === 409) { setState('conflict'); setMsg(x.message); } else { setState('error'); setMsg((x as Error).message); } }
  }
  const onChange = (v: string) => { setText(v); setState('dirty'); clearTimeout(timer.current); timer.current = setTimeout(() => flush(), 1500); };
  if (!plan) return <p className="muted">{msg || 'Loading…'}</p>;
  const cur = plan.sectionList.find((s: any) => s.key === key);
  return (<div className="stack"><Link href="/studio">← Business Studio</Link><div className="row between"><h1>{plan.title}</h1><div style={{ width: 200 }}><div className="small muted">{plan.completion.complete} of 16 complete</div><Bar value={plan.completion.percent} /></div></div>
    <div className="grid" style={{ gridTemplateColumns: 'minmax(220px,300px) 1fr' }}>
      <div className="card stack" style={{ padding: 8 }} role="tablist">{plan.sectionList.map((s: any, i: number) => <button key={s.key} role="tab" aria-selected={s.key === key} className={'sec ' + (s.key === key ? 'on' : '')} onClick={() => select(s.key)}><span className={'pip ' + s.state} /> <span className="small">{i + 1}. {s.label}</span></button>)}</div>
      <div className="card stack"><div><h2>{cur.label}</h2><p className="muted small">{cur.hint}</p></div>
        <textarea aria-label={cur.label} style={{ minHeight: 320 }} value={text} onChange={e => onChange(e.target.value)} disabled={state === 'conflict'} placeholder="Write here. Say what is measured and what is your estimate." />
        <div className="row between"><span className="small muted" aria-live="polite">{state === 'saved' ? 'All changes saved' : state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Unsaved changes' : ''} · {text.trim().length} characters (a section shows complete from {SECTION_COMPLETE_MIN_CHARS})</span>
          <div className="row"><button className="btn ghost sm" onClick={() => flush(true)} disabled={state === 'conflict'}>Save a version</button></div></div>
        {state === 'conflict' && <div className="notice">{msg} <button className="btn sm" onClick={() => load()}>Reload latest</button></div>}{state === 'error' && <p className="err">{msg}</p>}{state === 'saved' && msg && <p className="okmsg">{msg}</p>}</div></div></div>);
}
