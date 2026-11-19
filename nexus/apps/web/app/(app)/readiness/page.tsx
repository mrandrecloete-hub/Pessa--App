'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { get, post } from '@/lib/api';
import { Bar, Err, Ring } from '@/components/ui';
import { useApp } from '@/components/Shell';
type Cat = { key: string; label: string; weight: number; items: { id: string; label: string; suggestion: string }[] };
export default function Readiness() {
  const { biz } = useApp(); const [model, setModel] = useState<Cat[]>([]); const [ans, setAns] = useState<Record<string, string>>({}); const [res, setRes] = useState<any>(null); const [e, setE] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { get('/readiness/model').then(setModel); }, []);
  useEffect(() => { if (biz) get(`/businesses/${biz.id}/readiness/latest`).then(r => { if (r) { setRes(r); setAns(r.answers); } }); }, [biz]);
  if (!biz) return <div className="card">Create a business profile first. <Link href="/business">Create profile</Link></div>;
  async function submit() { setBusy(true); setE(null); try { setRes(await post(`/businesses/${biz!.id}/readiness`, { answers: ans })); window.scrollTo({ top: 0 }); } catch (x: any) { setE(x.message); } setBusy(false); }
  return (<div className="stack"><h1>Funding Readiness Assessment</h1><p className="muted">Answer honestly. This measures your preparation using NEXUS weights. It is not an official institutional assessment and does not predict approval.</p>
    {res && <div className="card stack"><div className="row"><Ring value={res.overall} size={120} caption="prepared" /><div className="grow"><h2>Overall preparation score</h2><div className="muted small">Questions answered: {res.completion}%</div><Bar value={res.completion} /></div></div>
      <div className="grid g3">{res.categories.map((c: any) => <div key={c.key} className="card flat"><div className="row between"><b className="small">{c.label}</b><span className="muted small">{c.weight}%</span></div><div style={{ margin: '6px 0' }}><Bar value={c.score} /></div><div className="small">{c.score}% {c.weak && <span className="badge warn">Weak</span>}</div></div>)}</div>
      {res.nextActions.length > 0 && <div><h3>Suggested improvements</h3><ul style={{ paddingLeft: 18 }}>{res.nextActions.map((a: string) => <li key={a}>{a}</li>)}</ul></div>}<div className="notice small">{res.notice}</div></div>}
    {model.map(c => <div key={c.key} className="card stack"><div className="row between"><h2>{c.label}</h2><span className="badge">{c.weight}% of score</span></div>
      {c.items.map(it => <div key={it.id} className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}><div style={{ flex: '1 1 260px' }}><div>{it.label}</div></div>
        <div className="radios" role="radiogroup" aria-label={it.label}>{(['YES', 'PARTIAL', 'NO'] as const).map(v => <label key={v}><input type="radio" name={it.id} checked={ans[it.id] === v} onChange={() => setAns({ ...ans, [it.id]: v })} /><span>{v === 'YES' ? 'Yes' : v === 'PARTIAL' ? 'Partly' : 'No'}</span></label>)}</div></div>)}</div>)}
    <Err e={e} /><div className="row"><button className="btn gold" onClick={submit} disabled={busy || Object.keys(ans).length === 0}>{busy ? 'Saving…' : 'Save and score my readiness'}</button><Link className="btn ghost" href="/matches">See my matches</Link></div></div>);
}
