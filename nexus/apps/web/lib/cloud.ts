/**
 * Optional cloud sync for the on-device app. The phone stays the working copy; the server keeps one backup copy per account.
 * Rules: never overwrite silently. If both the cloud and this device changed, the person chooses which copy to keep.
 */
import { applyCloud, exportObject, isDirty, markClean, setChangeHook } from './local';

const KEY = 'nexus.cloud.v1';
export interface CloudCfg { server: string; email: string; accessToken: string; refreshToken: string; revision: number; lastSyncAt?: string; conflict?: { revision: number; updatedAt: string | null } | null; lastMessage?: string }
export type SyncStatus = 'uptodate' | 'pushed' | 'pulled' | 'conflict' | 'offline' | 'error' | 'disconnected';
export interface SyncResult { status: SyncStatus; message: string }

export function getCfg(): CloudCfg | null { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function setCfg(c: CloudCfg | null) { try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const cleanServer = (v: string) => { let u = v.trim().replace(/\/+$/, ''); if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return u; };

class NetErr extends Error {}
async function raw(server: string, method: string, path: string, body?: unknown, token?: string) {
  let r: Response;
  try { r = await fetch(`${server}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', 'x-nexus-client': 'mobile', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new NetErr('Cannot reach the server. Check the address and your internet connection.'); }
  const text = await r.text(); let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: r.status, json };
}
async function authed(cfg: CloudCfg, method: string, path: string, body?: unknown) {
  let r = await raw(cfg.server, method, path, body, cfg.accessToken);
  if (r.status === 401 && cfg.refreshToken) {
    const rf = await raw(cfg.server, 'POST', '/auth/refresh', { refreshToken: cfg.refreshToken });
    if (rf.status === 200 && rf.json?.accessToken) { cfg.accessToken = rf.json.accessToken; cfg.refreshToken = rf.json.refreshToken; setCfg(cfg); r = await raw(cfg.server, method, path, body, cfg.accessToken); }
    else { throw new Error('Your cloud sign in has expired. Sign in again.'); }
  }
  return r;
}

export async function connect(serverIn: string, email: string, password: string, create: boolean, first = '', last = ''): Promise<void> {
  const server = cleanServer(serverIn);
  if (!/^https:\/\//i.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(server)) throw new Error('Use an https address for the server.');
  const r = await raw(server, 'POST', create ? '/auth/register' : '/auth/login', create ? { email, password, firstName: first || 'NEXUS', lastName: last || 'User' } : { email, password });
  if (r.status !== 200 && r.status !== 201) throw new Error(r.json?.message || 'Could not sign in.');
  if (!r.json?.accessToken) throw new Error('The server did not return a sign in. Is this a NEXUS server?');
  setCfg({ server, email: email.trim().toLowerCase(), accessToken: r.json.accessToken, refreshToken: r.json.refreshToken, revision: 0, conflict: null });
}
export function disconnect() { setCfg(null); }

let running = false;
export async function syncNow(): Promise<SyncResult> {
  const cfg = getCfg(); if (!cfg) return { status: 'disconnected', message: 'Not connected to a cloud account.' };
  if (running) return { status: 'uptodate', message: 'A sync is already running.' };
  running = true;
  try {
    const g = await authed(cfg, 'GET', '/sync'); if (g.status !== 200) throw new Error(g.json?.message || 'Cloud read failed.');
    const cloudRev: number = g.json.revision; const dirty = isDirty(); const done = (status: SyncStatus, message: string): SyncResult => { cfg.lastMessage = message; setCfg(cfg); return { status, message }; };
    if (cloudRev > cfg.revision && dirty) { cfg.conflict = { revision: cloudRev, updatedAt: g.json.updatedAt }; return done('conflict', 'This device and the cloud both changed. Choose which copy to keep.'); }
    if (cloudRev > cfg.revision) { applyCloud(g.json.data); cfg.revision = cloudRev; cfg.conflict = null; cfg.lastSyncAt = new Date().toISOString(); return done('pulled', 'Loaded the newer copy from the cloud.'); }
    if (!dirty && cloudRev > 0) { cfg.lastSyncAt = new Date().toISOString(); return done('uptodate', 'Up to date.'); }
    const p = await authed(cfg, 'PUT', '/sync', { baseRevision: cfg.revision, data: exportObject() });
    if (p.status === 409) { cfg.conflict = { revision: p.json?.revision ?? cloudRev + 1, updatedAt: p.json?.updatedAt ?? null }; return done('conflict', 'The cloud copy changed while syncing. Choose which copy to keep.'); }
    if (p.status !== 200) throw new Error(p.json?.message || 'Cloud save failed.');
    cfg.revision = p.json.revision; cfg.conflict = null; cfg.lastSyncAt = new Date().toISOString(); markClean(); return done('pushed', 'Saved to the cloud.');
  } catch (e: any) {
    const status: SyncStatus = e instanceof NetErr ? 'offline' : 'error'; cfg.lastMessage = e.message; setCfg(cfg); return { status, message: e.message };
  } finally { running = false; }
}

/** After a conflict: 'device' pushes this device's data over the cloud copy, 'cloud' replaces this device with the cloud copy. */
export async function resolveConflict(choice: 'device' | 'cloud'): Promise<SyncResult> {
  const cfg = getCfg(); if (!cfg?.conflict) return { status: 'uptodate', message: 'Nothing to resolve.' };
  try {
    const g = await authed(cfg, 'GET', '/sync'); if (g.status !== 200) throw new Error(g.json?.message || 'Cloud read failed.');
    if (choice === 'cloud') { applyCloud(g.json.data); cfg.revision = g.json.revision; }
    else { const p = await authed(cfg, 'PUT', '/sync', { baseRevision: g.json.revision, data: exportObject() }); if (p.status !== 200) throw new Error(p.json?.message || 'Cloud save failed.'); cfg.revision = p.json.revision; markClean(); }
    cfg.conflict = null; cfg.lastSyncAt = new Date().toISOString(); cfg.lastMessage = choice === 'cloud' ? 'This device now matches the cloud.' : 'The cloud now matches this device.'; setCfg(cfg);
    return { status: choice === 'cloud' ? 'pulled' : 'pushed', message: cfg.lastMessage };
  } catch (e: any) { return { status: e instanceof NetErr ? 'offline' : 'error', message: e.message }; }
}

let timer: any = null;
/** Syncs a few seconds after each change, and once when the app opens. Stops while a conflict waits for a decision. */
export function startAutoSync() {
  const run = () => { const c = getCfg(); if (c && !c.conflict) syncNow().then(() => window.dispatchEvent(new Event('nexus-sync'))); };
  setChangeHook(() => { if (!getCfg()) return; clearTimeout(timer); timer = setTimeout(run, 4000); });
  setTimeout(run, 1500); window.addEventListener('online', run);
}
