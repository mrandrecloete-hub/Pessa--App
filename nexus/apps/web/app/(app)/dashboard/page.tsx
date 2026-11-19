'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { get, date } from '@/lib/api';
import { Bar, Ring, VerifyBadge } from '@/components/ui';
import { useApp } from '@/components/Shell';
export default function Dashboard() {
  const { me } = useApp(); const [d, setD] = useState<any>(null); const [e, setE] = useState<string | null>(null);
  useEffect(() => { get('/dashboard').then(setD).catch(x => setE(x.message)); }, []);
  if (e) return <p className="err">{e}</p>; if (!d) return <p className="muted">Loading…</p>;
  const stat = (v: any, l: string) => <div className="card stat"><b>{v ?? '–'}</b><span>{l}</span></div>;
  return (<div className="stack">
    <div className="hero"><img className="bg" src="/brand/hero-dune-tree.png" alt="" /><div className="txt"><h1>Welcome back, {me.firstName}!</h1><p className="muted" style={{ margin: '6px 0 0' }}>{d.business ? d.business.name : 'Building a stronger Namibia together.'}</p>
      {d.business && <div style={{ marginTop: 12, maxWidth: 260 }}><div className="small muted">Profile completion {d.business.profileCompletion}%</div><Bar value={d.business.profileCompletion} /></div>}</div></div>
    <div className="grid g4">{stat(d.activeVerified, 'Verified open opportunities')}{stat(d.activeDemo, 'Demonstration opportunities')}{stat(d.matchingCount, 'Potentially matching')}{stat(d.savedCount, 'Saved opportunities')}</div>
    {d.business && <div className="grid g4">{stat(d.applicationsPreparing, 'Applications being prepared')}{stat(d.applicationsSubmitted, 'Submitted applications')}{stat(d.outstandingTasks, 'Outstanding preparation tasks')}{stat(d.plan ? d.plan.percent + '%' : '0%', 'Business plan completion')}</div>}
    {d.onboarding.length > 0 && <div className="card"><h2>Next steps</h2><ul className="stack" style={{ paddingLeft: 18 }}>{d.onboarding.map((o: string) => <li key={o}>{o}</li>)}</ul>
      <div className="row"><Link className="btn gold" href={d.business ? '/readiness' : '/business'}>{d.business ? 'Take the readiness assessment' : 'Create business profile'}</Link></div></div>}
    <div className="grid g2">
      <div className="card"><h2>Readiness</h2>{d.readiness ? <div className="row" style={{ marginTop: 12 }}><Ring value={d.readiness.overall} caption="prepared" /><div><p className="muted small" style={{ margin: 0 }}>Taken {date(d.readiness.takenAt)}. This is a NEXUS preparation score, not an institutional assessment.</p><Link href="/readiness">Review and improve</Link></div></div> : <p className="muted">Not taken yet. <Link href="/readiness">Start the assessment</Link></p>}</div>
      <div className="card"><h2>Upcoming deadlines</h2>{(d.upcomingDeadlines ?? []).length === 0 ? <p className="muted">Save opportunities to see their closing dates here.</p> : d.upcomingDeadlines.map((x: any) => <div key={x.programmeId} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}><Link href={'/funding/view?id=' + x.programmeId}>{x.name}</Link><span className="row"><VerifyBadge status={x.verificationStatus} /><span className="small">{date(x.closesAt)}</span></span></div>)}</div></div>
    {d.plan && <div className="card"><h2>Business plan</h2><p className="muted small">{d.plan.title}</p><Bar value={d.plan.percent} /><Link href={'/studio/edit?id=' + d.plan.id}>Continue writing</Link></div>}
  </div>);
}
