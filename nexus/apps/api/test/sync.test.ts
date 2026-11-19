import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Client, register } from './helpers';
import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';

let app: INestApplication, prisma: PrismaClient, base: string;
before(async () => { ({ app, prisma, base } = await boot()); });
after(async () => { await app.close(); await prisma.$disconnect(); });
const backup = (name: string) => ({ app: 'nexus-namibia-local', version: 1, exportedAt: new Date().toISOString(), data: { business: { id: 'b1', name }, readiness: [], plans: [], planVersions: [], saved: [], programmes: [] } });

test('sync needs sign in', async () => {
  const c = new Client(base); assert.equal((await c.get('/sync')).status, 401); assert.equal((await c.put('/sync', { baseRevision: 0, data: backup('x') })).status, 401);
});
test('first push, read back, stale push is refused, next push works', async () => {
  const a = await register(base, 'sync-a@example.com');
  assert.deepEqual((await a.get('/sync')).body, { revision: 0, updatedAt: null, data: null });
  const p1 = await a.put('/sync', { baseRevision: 0, data: backup('One') }); assert.equal(p1.status, 200); assert.equal(p1.body.revision, 1);
  assert.equal((await a.get('/sync')).body.data.data.business.name, 'One');
  const stale = await a.put('/sync', { baseRevision: 0, data: backup('Stale') }); assert.equal(stale.status, 409); assert.equal(stale.body.revision, 1);
  assert.equal((await a.get('/sync')).body.data.data.business.name, 'One', 'stale push did not overwrite');
  const p2 = await a.put('/sync', { baseRevision: 1, data: backup('Two') }); assert.equal(p2.body.revision, 2);
  assert.equal(await prisma.syncSnapshot.count(), 1);
  assert.ok(await prisma.auditLog.count({ where: { action: 'sync.push' } }) >= 2);
});
test('concurrent pushes: exactly one wins', async () => {
  const a = await register(base, 'sync-race@example.com'); await a.put('/sync', { baseRevision: 0, data: backup('Start') });
  const r = await Promise.all([a.put('/sync', { baseRevision: 1, data: backup('A') }), a.put('/sync', { baseRevision: 1, data: backup('B') })]);
  assert.deepEqual(r.map(x => x.status).sort(), [200, 409]);
});
test('each user only sees their own cloud copy', async () => {
  const a = await register(base, 'sync-own1@example.com'), b = await register(base, 'sync-own2@example.com');
  await a.put('/sync', { baseRevision: 0, data: backup('Mine') }); assert.equal((await b.get('/sync')).body.revision, 0); assert.equal((await b.get('/sync')).body.data, null);
});
test('only NEXUS backups, within the size limit, are accepted', async () => {
  const a = await register(base, 'sync-bad@example.com');
  assert.equal((await a.put('/sync', { baseRevision: 0, data: { hello: 'world' } })).status, 400);
  assert.equal((await a.put('/sync', { baseRevision: 'x', data: backup('x') })).status, 400);
  const big = backup('big'); (big.data as any).programmes = [{ blob: 'x'.repeat(1_600_000) }]; assert.equal((await a.put('/sync', { baseRevision: 0, data: big })).status, 413);
});
test('CORS allows only the configured on-device origin', async () => {
  const ok = await fetch(base + '/sync', { method: 'OPTIONS', headers: { origin: 'https://appassets.nexus.local', 'access-control-request-method': 'PUT', 'access-control-request-headers': 'authorization,content-type' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://appassets.nexus.local');
  const no = await fetch(base + '/sync', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'PUT' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});
test('mobile token flow works for sync with refresh', async () => {
  await register(base, 'sync-mob@example.com');
  const m = new Client(base, { 'x-nexus-client': 'mobile' }); const l = await m.post('/auth/login', { email: 'sync-mob@example.com', password: 'Sunrise-Namib-2026' });
  const t = new Client(base, { authorization: 'Bearer ' + l.body.accessToken }); assert.equal((await t.put('/sync', { baseRevision: 0, data: backup('M') })).status, 200);
  const r = await new Client(base, { 'x-nexus-client': 'mobile' }).post('/auth/refresh', { refreshToken: l.body.refreshToken }); assert.equal(r.status, 200); assert.ok(r.body.accessToken && r.body.refreshToken);
});
