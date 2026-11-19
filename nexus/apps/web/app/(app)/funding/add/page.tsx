'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api';
import { LOCAL } from '@/lib/local';
import { Err, Field } from '@/components/ui';
import { APPLICANT_TYPES, REGIONS, SECTORS, STAGES, label } from '@nexus/business-logic';
function Multi({ title, opts, val, set, pretty = true }: { title: string; opts: readonly string[]; val: string[]; set: (v: string[]) => void; pretty?: boolean }) {
  return (<div><label>{title} (leave empty for open to all)</label><div className="row">{opts.map(o => { const on = val.includes(o); return <label key={o} className="badge" style={{ cursor: 'pointer', margin: 0, color: on ? 'var(--gold2)' : undefined, borderColor: on ? 'var(--gold)' : undefined }}>
    <input type="checkbox" style={{ display: 'none' }} checked={on} onChange={() => set(on ? val.filter(x => x !== o) : [...val, o])} />{pretty ? label(o) : o}</label>; })}</div></div>);
}
export default function AddProgramme() {
  const r = useRouter(); const [f, setF] = useState<any>({ name: '', institutionName: '', category: '', description: '', websiteUrl: '', sourceNote: '', closesAt: '', amountMaxNad: '', docs: '' });
  const [sectors, setSectors] = useState<string[]>([]), [stages, setStages] = useState<string[]>([]), [regions, setRegions] = useState<string[]>([]), [types, setTypes] = useState<string[]>([]);
  const [verified, setVerified] = useState(false); const [e, setE] = useState<string | null>(null);
  const set = (k: string) => (ev: React.ChangeEvent<any>) => setF({ ...f, [k]: ev.target.value });
  if (!LOCAL) return <div className="card">Programmes are managed by administrators on the server.</div>;
  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); setE(null);
    const criteria: any[] = []; if (sectors.length) criteria.push({ kind: 'SECTOR', values: sectors }); if (stages.length) criteria.push({ kind: 'STAGE', values: stages }); if (regions.length) criteria.push({ kind: 'REGION', values: regions });
    if (types.length) criteria.push({ kind: 'APPLICANT_TYPE', values: types }); if (f.amountMaxNad) criteria.push({ kind: 'MAX_AMOUNT', numberValue: Number(f.amountMaxNad) });
    try { const p = await post('/programmes', { name: f.name, institutionName: f.institutionName, category: f.category, description: f.description, websiteUrl: f.websiteUrl, sourceNote: f.sourceNote, closesAt: f.closesAt ? new Date(f.closesAt).toISOString() : null,
      amountMaxNad: f.amountMaxNad ? Number(f.amountMaxNad) : null, criteria, documents: f.docs.split(',').map((x: string) => x.trim()).filter(Boolean).map((l: string) => ({ category: 'OTHER', label: l })), verifiedByMe: verified }); r.push('/funding/view?id=' + p.id); } catch (x: any) { setE(x.message); }
  }
  const ok = !!f.websiteUrl && !!f.sourceNote;
  return (<form className="stack" onSubmit={submit}><Link href="/funding">← Funding Directory</Link><h1>Add a funding programme</h1>
    <div className="notice">Enter only what the institution has published. NEXUS never invents funding details. A programme you add stays marked Unverified unless you record the official website and source and tick the box below.</div>
    <div className="card grid g2"><Field id="name" label="Programme name"><input id="name" required value={f.name} onChange={set('name')} /></Field><Field id="institutionName" label="Institution"><input id="institutionName" required value={f.institutionName} onChange={set('institutionName')} /></Field>
      <Field id="category" label="Category (for example SME financing)"><input id="category" value={f.category} onChange={set('category')} /></Field><Field id="closesAt" label="Closing date (if published)"><input id="closesAt" type="date" value={f.closesAt} onChange={set('closesAt')} /></Field>
      <Field id="amountMaxNad" label="Maximum funding in N$ (if published)"><input id="amountMaxNad" type="number" min={0} value={f.amountMaxNad} onChange={set('amountMaxNad')} /></Field><Field id="websiteUrl" label="Official website (https://…)"><input id="websiteUrl" type="url" value={f.websiteUrl} onChange={set('websiteUrl')} /></Field></div>
    <div className="card stack"><Field id="description" label="What the programme says about itself"><textarea id="description" value={f.description} onChange={set('description')} /></Field><Field id="sourceNote" label="Source (where you read this, and the date)"><input id="sourceNote" value={f.sourceNote} onChange={set('sourceNote')} /></Field>
      <Field id="docs" label="Required documents, separated by commas"><input id="docs" value={f.docs} onChange={set('docs')} /></Field></div>
    <div className="card stack"><h2>Published eligibility</h2><Multi title="Sectors" opts={SECTORS} val={sectors} set={setSectors} /><Multi title="Business stages" opts={STAGES} val={stages} set={setStages} /><Multi title="Regions" opts={REGIONS} val={regions} set={setRegions} pretty={false} /><Multi title="Applicant types" opts={APPLICANT_TYPES} val={types} set={setTypes} /></div>
    <label className="row" style={{ cursor: ok ? 'pointer' : 'not-allowed' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} disabled={!ok} checked={verified && ok} onChange={e => setVerified(e.target.checked)} /> I checked these details against the official source named above{!ok && <span className="muted small"> (enter the website and source first)</span>}</label>
    <Err e={e} /><div className="row"><button className="btn gold">Save programme</button></div></form>);
}
