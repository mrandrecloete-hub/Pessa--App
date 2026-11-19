'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { get, post } from '@/lib/api';
import { LOCAL } from '@/lib/local';
export interface Me { id: string; email: string; firstName: string; lastName: string; roles: string[] }
export interface Biz { id: string; name: string; profile: any; profileCompletion: number }
const Ctx = createContext<{ me: Me; biz: Biz | null; reload: () => Promise<void> } | null>(null);
export const useApp = () => useContext(Ctx)!;
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' }, { href: '/funding', label: 'Funding Directory', icon: '◈' }, { href: '/matches', label: 'My Matches', icon: '◎' },
  { href: '/readiness', label: 'Readiness', icon: '◐' }, { href: '/studio', label: 'Business Studio', icon: '✎' }, { href: '/business', label: 'Business Profile', icon: '▣' }, { href: '/applications', label: 'Applications', icon: '☰', soon: true },
  ...(LOCAL ? [{ href: '/funding/add', label: 'Add a Programme', icon: '+' }, { href: '/backup', label: 'Backup', icon: '⇩' }] : []),
];
const BOTTOM = [{ href: '/dashboard', label: 'Home' }, { href: '/funding', label: 'Funding' }, { href: '/studio', label: 'Business' }, { href: '/applications', label: 'Applications' }, { href: '/business', label: 'Profile' }];
export function Wordmark() { return (<div className="brand"><img src="/brand/emblem-64.png" alt="" width={30} height={30} /><div><b>NEXUS</b><span>NAMIBIA</span></div></div>); }
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), router = useRouter();
  const [me, setMe] = useState<Me | null>(null); const [biz, setBiz] = useState<Biz | null>(null); const [open, setOpen] = useState(false);
  const reload = async () => { const l = await get<Biz[]>('/businesses'); setBiz(l[0] ?? null); };
  useEffect(() => { (async () => { try { const m = await get<Me>('/auth/me'); setMe(m); await reload(); } catch { router.replace('/login'); } })(); }, []); // eslint-disable-line
  useEffect(() => { setOpen(false); }, [path]);
  if (!me) return <div className="auth"><p className="muted">Loading…</p></div>;
  const on = (h: string) => h === '/funding' ? path === '/funding' || path.startsWith('/funding/view') : path === h || path.startsWith(h + '/');
  const logout = async () => { await post('/auth/logout'); router.replace('/login'); };
  const link = (n: typeof NAV[number]) => <Link key={n.href} href={n.href} className={on(n.href) ? 'on' : ''} aria-current={on(n.href) ? 'page' : undefined}>{n.label}{n.soon && <span className="soon">Soon</span>}</Link>;
  return (<Ctx.Provider value={{ me, biz, reload }}><div>
    <header className="thin"><Link href="/dashboard" aria-label="NEXUS NAMIBIA home" style={{ textDecoration: 'none' }}><Wordmark /></Link>
      <nav className="tnav" aria-label="Main navigation">{NAV.map(link)}</nav><div className="grow tbiz muted small">{biz ? biz.name : ''}</div>
      {!LOCAL && <button className="btn ghost sm" onClick={logout}>Sign out</button>}
      <button className="menubtn btn ghost sm" aria-expanded={open} aria-controls="dropmenu" aria-label="Menu" onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button></header>
    {open && <nav id="dropmenu" className="drop" aria-label="Menu"><div className="muted small" style={{ padding: '6px 6px 10px' }}>{biz ? biz.name : 'No business yet'}{LOCAL ? ' · data stays on this device' : ''}</div>{NAV.map(link)}{!LOCAL && <a href="#" onClick={e => { e.preventDefault(); logout(); }}>Sign out</a>}</nav>}
    <main className="page">{children}
      <p className="muted small" style={{ marginTop: 28 }}>NEXUS is an independent technology product. It is not a government body or a lender and cannot approve funding.</p></main>
    <nav className="bottom" aria-label="Mobile navigation">{BOTTOM.map(n => <Link key={n.href} href={n.href} className={on(n.href) ? 'on' : ''}>{n.label}</Link>)}</nav></div></Ctx.Provider>);
}
