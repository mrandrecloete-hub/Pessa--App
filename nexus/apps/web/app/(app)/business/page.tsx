'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { post, put } from '@/lib/api';
import { Err, Field } from '@/components/ui';
import { useApp } from '@/components/Shell';
import { APPLICANT_TYPES, FUNDING_PURPOSES, REGIONS, REGISTRATION_STATUSES, SECTORS, STAGES, label } from '@nexus/business-logic';
const empty = { name: '', sector: '', stage: '', region: '', town: '', registrationStatus: '', yearsInOperation: '', employees: '', activity: '', fundingPurpose: '', fundingRequiredNad: '', availableCapitalNad: '', intendedImpact: '', applicantTypes: [] as string[] };
export default function BusinessPage() {
  const { biz, reload } = useApp(); const router = useRouter(); const [f, setF] = useState<any>(empty); const [e, setE] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (biz) setF({ ...empty, name: biz.name, ...Object.fromEntries(Object.entries(biz.profile ?? {}).filter(([k, v]) => k in empty && v != null).map(([k, v]) => [k, Array.isArray(v) ? v : String(v)])) }); }, [biz]);
  const set = (k: string) => (ev: React.ChangeEvent<any>) => setF({ ...f, [k]: ev.target.value });
  const toggle = (t: string) => setF({ ...f, applicantTypes: f.applicantTypes.includes(t) ? f.applicantTypes.filter((x: string) => x !== t) : [...f.applicantTypes, t] });
  async function save(ev: React.FormEvent) {
    ev.preventDefault(); setBusy(true); setE(null); setOk(false);
    const num = (v: string) => (v === '' ? undefined : Number(v)); const str = (v: string) => (v === '' ? undefined : v);
    const profile = { sector: str(f.sector), stage: str(f.stage), region: str(f.region), town: str(f.town), registrationStatus: str(f.registrationStatus), yearsInOperation: num(f.yearsInOperation), employees: num(f.employees), activity: str(f.activity),
      fundingPurpose: str(f.fundingPurpose), fundingRequiredNad: num(f.fundingRequiredNad), availableCapitalNad: num(f.availableCapitalNad), intendedImpact: str(f.intendedImpact), applicantTypes: f.applicantTypes };
    try { if (biz) await put('/businesses/' + biz.id, { name: f.name, profile }); else await post('/businesses', { name: f.name, profile }); await reload(); setOk(true); if (!biz) router.push('/funding'); } catch (x: any) { setE(x.message); } setBusy(false);
  }
  const sel = (id: string, l: string, opts: readonly string[], pretty = true) => <Field id={id} label={l}><select id={id} value={f[id]} onChange={set(id)}><option value="">Select…</option>{opts.map(o => <option key={o} value={o}>{pretty ? label(o) : o}</option>)}</select></Field>;
  return (<form className="stack" onSubmit={save}><h1>{biz ? 'Business Profile' : 'Create your business profile'}</h1><p className="muted">Only information needed for matching is collected. Leaving a field blank shows up as “unknown” in your matches.</p>
    <div className="card grid g2"><Field id="name" label="Business name"><input id="name" required minLength={2} value={f.name} onChange={set('name')} /></Field>{sel('sector', 'Sector', SECTORS)}{sel('stage', 'Business stage', STAGES)}{sel('registrationStatus', 'Registration status', REGISTRATION_STATUSES)}{sel('region', 'Region', REGIONS, false)}
      <Field id="town" label="Town or village"><input id="town" value={f.town} onChange={set('town')} /></Field><Field id="yearsInOperation" label="Years in operation"><input id="yearsInOperation" type="number" min={0} max={100} value={f.yearsInOperation} onChange={set('yearsInOperation')} /></Field>
      <Field id="employees" label="Number of employees"><input id="employees" type="number" min={0} value={f.employees} onChange={set('employees')} /></Field>{sel('fundingPurpose', 'Funding purpose', FUNDING_PURPOSES)}
      <Field id="fundingRequiredNad" label="Funding needed (N$)"><input id="fundingRequiredNad" type="number" min={0} value={f.fundingRequiredNad} onChange={set('fundingRequiredNad')} /></Field><Field id="availableCapitalNad" label="Your own available capital (N$)"><input id="availableCapitalNad" type="number" min={0} value={f.availableCapitalNad} onChange={set('availableCapitalNad')} /></Field></div>
    <div className="card stack"><div><label htmlFor="activity">What the business does</label><textarea id="activity" value={f.activity} onChange={set('activity')} maxLength={2000} /></div><div><label htmlFor="intendedImpact">Intended community impact</label><textarea id="intendedImpact" value={f.intendedImpact} onChange={set('intendedImpact')} maxLength={2000} /></div>
      <div><label>Applicant type (select any that you honestly are)</label><div className="row">{APPLICANT_TYPES.map(t => <label key={t} className="badge" style={{ cursor: 'pointer', color: f.applicantTypes.includes(t) ? 'var(--gold2)' : undefined, borderColor: f.applicantTypes.includes(t) ? 'var(--gold)' : undefined, margin: 0 }}><input type="checkbox" style={{ display: 'none' }} checked={f.applicantTypes.includes(t)} onChange={() => toggle(t)} />{label(t)}</label>)}</div></div></div>
    <Err e={e} />{ok && <p className="okmsg">Saved.</p>}<div className="row"><button className="btn gold" disabled={busy}>{busy ? 'Saving…' : biz ? 'Save profile' : 'Create profile and browse funding'}</button></div></form>);
}
