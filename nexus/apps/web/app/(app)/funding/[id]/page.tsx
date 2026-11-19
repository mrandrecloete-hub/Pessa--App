'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { get, put, del, nad, date } from '@/lib/api';
import { StatusBadge, VerifyBadge } from '@/components/ui';
import { useApp } from '@/components/Shell';
import MatchCard from '@/components/MatchCard';
import { label } from '@nexus/business-logic';
export default function Detail() {
  const { id } = useParams<{ id: string }>(); const { biz } = useApp(); const [p, setP] = useState<any>(null); const [m, setM] = useState<any>(null); const [e, setE] = useState<string | null>(null);
  const load = () => get('/programmes/' + id).then(setP).catch(x => setE(x.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { if (biz) get(`/businesses/${biz.id}/matches/${id}`).then(setM).catch(() => {}); }, [biz, id]);
  if (e) return <p className="err">{e}</p>; if (!p) return <p className="muted">Loading…</p>;
  const toggle = async () => { await (p.saved ? del : put)(`/programmes/${id}/save`); load(); };
  const val = (c: any) => c.values?.length ? c.values.map(label).join(', ') : c.numberValue != null ? Number(c.numberValue).toLocaleString('en-ZA') : '';
  return (<div className="stack"><Link href="/funding">← Funding Directory</Link>
    <div className="row"><VerifyBadge status={p.verificationStatus} at={p.lastVerifiedAt} /><StatusBadge s={p.status} /></div>
    <div><h1>{p.name}</h1><div className="muted">{p.institutionName} · {p.category}</div></div>
    {p.verificationStatus !== 'VERIFIED' && <div className="notice">{p.verificationStatus === 'DEMONSTRATION' ? 'Demonstration record: fictional, shown only to explain how matching works.' : 'Unverified: do not treat this as current official guidance.'}</div>}
    <div className="row"><button className="btn gold" onClick={toggle}>{p.saved ? '★ Saved' : '☆ Save this opportunity'}</button>{biz && <Link className="btn ghost" href="/readiness">Readiness assessment</Link>}{biz && <Link className="btn ghost" href="/studio">Start a business plan</Link>}</div>
    <div className="grid g2"><div className="card stack"><h2>About</h2><p>{p.description || 'No description published.'}</p><div className="small muted">Purpose: {p.purpose || 'Not published'}</div>
      <div className="small">Funding: {p.amountMinNad || p.amountMaxNad ? `${nad(p.amountMinNad)} to ${nad(p.amountMaxNad)}` : 'Not published'}</div><div className="small">Opens: {date(p.opensAt)} · Closes: {date(p.closesAt)}</div><div className="small">How to apply: {p.applicationMethod || 'Not published'}</div>
      <div className="small">Website: {p.websiteUrl ? <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer">{p.websiteUrl}</a> : 'Not published'}</div><div className="small">Contact: {p.contactDetails || 'Not published'}</div>
      <div className="small muted">Source: {p.sourceNote || 'None recorded'} · Last verified: {date(p.lastVerifiedAt)}</div></div>
    <div className="stack"><div className="card"><h2>Eligibility requirements</h2>{p.criteria.length === 0 ? <p className="muted">No published criteria recorded.</p> : p.criteria.map((c: any) => <div className="crit" key={c.id}><div><b>{label(c.kind)}</b> {c.mandatory ? <span className="badge">Required</span> : <span className="badge">Preferred</span>}<div className="muted small">{val(c)}</div></div></div>)}</div>
      <div className="card"><h2>Required documents</h2>{p.documents.length === 0 ? <p className="muted">None recorded.</p> : <ul style={{ paddingLeft: 18 }}>{p.documents.map((d: any) => <li key={d.id}>{d.label}</li>)}</ul>}</div></div></div>
    <h2>How your business compares</h2>{!biz ? <div className="card">Create a business profile to see how you compare. <Link href="/business">Create profile</Link></div> : m ? <MatchCard m={m} /> : <p className="muted">Checking…</p>}</div>);
}
