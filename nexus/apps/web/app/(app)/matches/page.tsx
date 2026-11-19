'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { useApp } from '@/components/Shell';
import MatchCard from '@/components/MatchCard';
export default function Matches() {
  const { biz } = useApp(); const [m, setM] = useState<any[] | null>(null);
  useEffect(() => { if (biz) get(`/businesses/${biz.id}/matches`).then(setM); }, [biz]);
  if (!biz) return <div className="card">Create a business profile first. <Link href="/business">Create profile</Link></div>;
  return (<div className="stack"><h1>Matching Opportunities</h1><p className="muted">How {biz.name} compares with the published criteria of each programme. Complete your profile to reduce unknowns.</p>
    {biz.profileCompletion < 100 && <div className="notice">Your profile is {biz.profileCompletion}% complete. <Link href="/business">Complete it</Link></div>}
    {!m ? <p className="muted">Checking…</p> : m.map(x => <MatchCard key={x.programmeId} m={x} link />)}</div>);
}
