'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { get, post } from '@/lib/api';
export interface Me { id: string; email: string; firstName: string; lastName: string; roles: string[] }
export interface Biz { id: string; name: string; profile: any; profileCompletion: number }
const Ctx = createContext<{ me: Me; biz: Biz | null; reload: () => Promise<void> } | null>(null);
export const useApp = () => useContext(Ctx)!;
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' }, { href: '/funding', label: 'Funding Directory', icon: '◈' }, { href: '/matches', label: 'My Matches', icon: '◎' },
  { href: '/readiness', label: 'Readiness', icon: '◐' }, { href: '/studio', label: 'Business Studio', icon: '✎' }, { href: '/business', label: 'Business Profile', icon: '▣' }, { href: '/applications', label: 'Applications', icon: '☰', soon: true },
];
const BOTTOM = [{ href: '/dashboard', label: 'Home' }, { href: '/funding', label: 'Funding' }, { href: '/studio', label: 'Business' }, { href: '/applications', label: 'Applications' }, { href: '/business', label: 'Profile' }];
export function Wordmark() { return (<div className="brand"><img src="/brand/emblem-64.png" alt="" width={46} height={46} /><div><b>NEXUS</b><span>NAMIBIA</span></div></div>); }
export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), router = useRouter();
  const [me, setMe] = useState<Me | null>(null); const [biz, setBiz] = useState<Biz | null>(null);
  const reload = async () => { const l = await get<Biz[]>('/businesses'); setBiz(l[0] ?? null); };
  useEffect(() => { (async () => { try { const m = await get<Me>('/auth/me'); setMe(m); await reload(); } catch { router.replace('/login'); } })(); }, []); // eslint-disable-line
  if (!me) return <div className="auth"><p className="muted">Loading…</p></div>;
  const on = (h: string) => path === h || path.startsWith(h + '/');
  const logout = async () => { await post('/auth/logout'); router.replace('/login'); };
  return (<Ctx.Provider value={{ me, biz, reload }}><div className="shell">
    <aside className="side" aria-label="Main navigation"><Wordmark /><nav className="nav">{NAV.map(n => <Link key={n.href} href={n.href} className={on(n.href) ? 'on' : ''}><span aria-hidden>{n.icon}</span>{n.label}{n.soon && <span className="soon">Soon</span>}</Link>)}</nav>
      <div className="foot">NEXUS is an independent technology product. It is not a government body or a lender and cannot approve funding.</div></aside>
    <div className="main"><header className="top"><div className="grow"><b>{me.firstName} {me.lastName}</b><div className="muted small">{biz ? biz.name : 'No business yet'}</div></div><button className="btn ghost sm" onClick={logout}>Sign out</button></header>
      <main className="page">{children}</main></div>
    <nav className="bottom" aria-label="Mobile navigation">{BOTTOM.map(n => <Link key={n.href} href={n.href} className={on(n.href) ? 'on' : ''}>{n.label}</Link>)}</nav></div></Ctx.Provider>);
}
