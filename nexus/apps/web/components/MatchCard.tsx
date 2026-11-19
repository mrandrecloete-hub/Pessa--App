'use client';
import Link from 'next/link';
import { Ring, VerifyBadge } from './ui';
import { date } from '@/lib/api';
const STATUS: Record<string, [string, string]> = { MEETS_PUBLISHED_CRITERIA: ['Meets published criteria', 'ok'], PARTIAL: ['Partly meets criteria', 'warn'], MANDATORY_NOT_MET: ['A required criterion is not met', 'err'], INSUFFICIENT_INFORMATION: ['Not enough information', ''], UNVERIFIED: ['Programme unverified', 'warn'] };
export default function MatchCard({ m, link }: { m: any; link?: boolean }) {
  const [t, cls] = STATUS[m.status] ?? [m.status, ''];
  const list = (title: string, items: any[]) => items.length > 0 && <div><h3 style={{ margin: '10px 0 4px' }}>{title}</h3>{items.map(c => <div className="crit" key={c.criterionId}><span className={'dot ' + c.status} /><div><b>{c.title}</b>{c.mandatory && <span className="badge" style={{ marginLeft: 6 }}>Required</span>}<div className="muted small">{c.explanation}</div></div></div>)}</div>;
  return (<div className="card stack"><div className="row"><Ring value={m.score} caption="of criteria" /><div className="grow"><div className="row"><VerifyBadge status={m.verificationStatus} at={m.lastVerifiedAt} /><span className={'badge ' + cls}>{t}</span></div>
    <h3 style={{ marginTop: 6 }}>{link ? <Link href={'/funding/' + m.programmeId}>{m.programmeName}</Link> : m.programmeName}</h3><div className="muted small">{m.institutionName} · closes {date(m.closesAt)}</div><div className="small" style={{ marginTop: 4 }}>{m.basis}</div></div></div>
    {list('Criteria met', m.met)}{list('Criteria not met', m.unmet)}{list('Unknown: add this to your profile', m.unknown)}
    {m.missingDocuments.length > 0 && <div><h3>Missing documents</h3><ul style={{ paddingLeft: 18, margin: 0 }}>{m.missingDocuments.map((d: any) => <li key={d.category}>{d.label}</li>)}</ul></div>}
    {m.nextActions.length > 0 && <div><h3>Recommended next actions</h3><ul style={{ paddingLeft: 18, margin: 0 }}>{m.nextActions.map((a: string) => <li key={a}>{a}</li>)}</ul></div>}
    <div className="muted small">Source: {m.sourceNote || 'None recorded'} {m.websiteUrl && <a href={m.websiteUrl} target="_blank" rel="noopener noreferrer">official website</a>}</div><div className="notice small">{m.disclaimer}</div></div>);
}
