'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { get, post, date } from '@/lib/api';
import { Bar, Err } from '@/components/ui';
import { useApp } from '@/components/Shell';
export default function Studio() {
  const { biz } = useApp(); const r = useRouter(); const [plans, setPlans] = useState<any[] | null>(null); const [e, setE] = useState<string | null>(null);
  useEffect(() => { if (biz) get(`/businesses/${biz.id}/plans`).then(setPlans); }, [biz]);
  if (!biz) return <div className="card">Create a business profile first. <Link href="/business">Create profile</Link></div>;
  async function create() { try { const p = await post(`/businesses/${biz!.id}/plans`, {}); r.push('/studio/edit?id=' + p.id); } catch (x: any) { setE(x.message); } }
  return (<div className="stack"><h1>Business Studio</h1><p className="muted">Write your business plan in 16 sections. Your text saves automatically. Mark estimates as estimates: NEXUS never invents market data for you.</p>
    <div><button className="btn gold" onClick={create}>+ Start a new business plan</button></div><Err e={e} />
    {plans && plans.length === 0 && <div className="card muted">No plans yet.</div>}
    {plans?.map(p => <div key={p.id} className="card stack"><div className="row between"><h3><Link href={'/studio/edit?id=' + p.id}>{p.title}</Link></h3><span className="muted small">Updated {date(p.updatedAt)}</span></div><Bar value={p.completion.percent} /><div className="small muted">{p.completion.complete} of {p.completion.total} sections complete</div></div>)}</div>);
}
