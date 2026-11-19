'use client';
import React from 'react';
import { label } from '@nexus/business-logic';
export function Ring({ value, size = 96, caption }: { value: number | null; size?: number; caption?: string }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r, v = value ?? 0;
  return (<div style={{ width: size, height: size, position: 'relative', flex: 'none' }} role="img" aria-label={value == null ? 'No score' : `${value} percent`}>
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#101D31" strokeWidth="9" />
      {value != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#g)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />}
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2563EB" /><stop offset="1" stopColor="#22D3EE" /></linearGradient></defs></svg>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}><div><b style={{ fontSize: size / 4 }}>{value == null ? 'n/a' : value + '%'}</b>{caption && <div className="muted" style={{ fontSize: 10 }}>{caption}</div>}</div></div></div>);
}
export function Bar({ value }: { value: number }) { return <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: value + '%' }} /></div>; }
export function VerifyBadge({ status, at }: { status: string; at?: string | null }) {
  if (status === 'DEMONSTRATION') return <span className="badge demo">DEMONSTRATION</span>;
  if (status === 'VERIFIED') return <span className="badge ok">Verified {at ? new Date(at).toLocaleDateString('en-ZA') : ''}</span>;
  return <span className="badge warn">Unverified</span>;
}
export const StatusBadge = ({ s }: { s: string }) => <span className={'badge ' + (s === 'OPEN' ? 'ok' : s === 'CLOSED' || s === 'SUSPENDED' ? 'err' : '')}>{label(s)}</span>;
export function Err({ e }: { e: string | null }) { return e ? <p className="err" role="alert">{e}</p> : null; }
export function Field({ id, label: l, children }: { id: string; label: string; children: React.ReactNode }) { return <div><label htmlFor={id}>{l}</label>{children}</div>; }
