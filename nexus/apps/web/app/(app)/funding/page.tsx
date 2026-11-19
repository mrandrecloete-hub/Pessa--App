'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { get, put, del, nad, date } from '@/lib/api';
import { StatusBadge, VerifyBadge } from '@/components/ui';
import { REGIONS, SECTORS, label } from '@nexus/business-logic';
export default function Funding() {
  const [q, setQ] = useState(''); const [sector, setSector] = useState(''); const [region, setRegion] = useState(''); const [verification, setVerification] = useState(''); const [sort, setSort] = useState('closing');
  const [data, setData] = useState<any>(null); const [e, setE] = useState<string | null>(null); const [verifiedCount, setVC] = useState<number | null>(null);
  const load = useCallback(() => { const p = new URLSearchParams({ sort }); if (q) p.set('q', q); if (sector) p.set('sector', sector); if (region) p.set('region', region); if (verification) p.set('verification', verification);
    get('/programmes?' + p).then(setData).catch(x => setE(x.message)); }, [q, sector, region, verification, sort]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { get('/programmes?verification=VERIFIED').then(r => setVC(r.total)); }, []);
  async function toggle(p: any) { await (p.saved ? del : put)(`/programmes/${p.id}/save`); load(); }
  return (<div className="stack"><h1>Funding Directory</h1>
    {verifiedCount === 0 && <div className="notice">No verified funding opportunities are published yet. The records below are clearly marked DEMONSTRATION records that show how NEXUS works. They are not real funding opportunities. Verified information will appear here only after an administrator checks it against the official source.</div>}
    <div className="card grid g4"><div><label htmlFor="q">Search</label><input id="q" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, institution or keyword" /></div>
      <div><label htmlFor="s">Sector</label><select id="s" value={sector} onChange={e => setSector(e.target.value)}><option value="">All sectors</option>{SECTORS.map(s => <option key={s} value={s}>{label(s)}</option>)}</select></div>
      <div><label htmlFor="r">Region</label><select id="r" value={region} onChange={e => setRegion(e.target.value)}><option value="">All regions</option>{REGIONS.map(s => <option key={s}>{s}</option>)}</select></div>
      <div><label htmlFor="v">Verification</label><select id="v" value={verification} onChange={e => setVerification(e.target.value)}><option value="">All</option><option value="VERIFIED">Verified</option><option value="DEMONSTRATION">Demonstration</option><option value="UNVERIFIED">Unverified</option></select></div></div>
    <div className="row between"><span className="muted small">{data ? data.total + ' result(s)' : ''}</span><div className="row"><label htmlFor="so" style={{ margin: 0 }}>Sort</label><select id="so" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)}><option value="closing">Closing soonest</option><option value="name">Name</option><option value="newest">Newest</option></select></div></div>
    {e && <p className="err">{e}</p>}{data && data.items.length === 0 && <div className="card muted">No opportunities match these filters.</div>}
    <div className="grid g2">{data?.items.map((p: any) => <div key={p.id} className="card stack"><div className="row between"><VerifyBadge status={p.verificationStatus} at={p.lastVerifiedAt} /><StatusBadge s={p.status} /></div>
      <div><h3><Link href={'/funding/' + p.id}>{p.name}</Link></h3><div className="muted small">{p.institutionName} · {p.category}</div></div><p className="muted small" style={{ margin: 0 }}>{p.description}</p>
      <div className="small">Amount: {p.amountMinNad || p.amountMaxNad ? `${nad(p.amountMinNad)} to ${nad(p.amountMaxNad)}` : 'Not published'} · Closes: {date(p.closesAt)}</div>
      <div className="row"><Link className="btn sm" href={'/funding/' + p.id}>View details</Link><button className="btn ghost sm" onClick={() => toggle(p)}>{p.saved ? '★ Saved' : '☆ Save'}</button></div></div>)}</div></div>);
}
