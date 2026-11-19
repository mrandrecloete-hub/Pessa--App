import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, Client, register, makeAdmin, PW } from './helpers';
import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { execSync } from 'child_process';

let app: INestApplication, prisma: PrismaClient, base: string;
before(async () => {
  ({ app, prisma, base } = await boot());
  execSync('node dist/prisma/seed.js', { env: { ...process.env }, stdio: 'pipe' });
});
after(async () => { await app.close(); await prisma.$disconnect(); });

test('health is public; everything else needs sign in', async () => {
  const c = new Client(base);
  assert.equal((await c.get('/health')).status, 200);
  for (const p of ['/dashboard', '/programmes', '/businesses', '/auth/me']) assert.equal((await c.get(p)).status, 401, p);
});

test('registration validates, hashes and signs in with httpOnly cookies', async () => {
  const c = new Client(base);
  assert.equal((await c.post('/auth/register', { email: 'bad', password: PW, firstName: 'A', lastName: 'B' })).status, 400);
  assert.equal((await c.post('/auth/register', { email: 'weak@example.com', password: 'short', firstName: 'A', lastName: 'B' })).status, 400);
  assert.equal((await c.post('/auth/register', { email: 'weak@example.com', password: 'aaaaaaaaaaaa', firstName: 'A', lastName: 'B' })).status, 400);
  const r = await c.post('/auth/register', { email: 'Thandi@Example.com', password: PW, firstName: 'Thandi', lastName: 'Katjua' });
  assert.equal(r.status, 201); assert.deepEqual(r.body.user.roles, ['CITIZEN']); assert.equal(r.body.user.passwordHash, undefined); assert.equal(r.body.accessToken, undefined);
  const raw = (r.headers as any).getSetCookie().join('\n'); assert.match(raw, /nexus_at=.*HttpOnly/i); assert.match(raw, /SameSite=Strict/i);
  const row = await prisma.user.findUniqueOrThrow({ where: { email: 'thandi@example.com' } }); assert.ok(row.passwordHash.startsWith('scrypt$')); assert.ok(!row.passwordHash.includes(PW));
  assert.equal((await c.get('/auth/me')).body.firstName, 'Thandi');
  assert.equal((await new Client(base).post('/auth/register', { email: 'thandi@example.com', password: PW, firstName: 'X', lastName: 'Y' })).status, 409);
  assert.equal((await new Client(base).post('/auth/register', { email: 'x@example.com', password: PW, firstName: 'X', lastName: 'Y', role: 'SUPER_ADMIN' })).status, 400, 'unknown fields rejected');
});

test('login, wrong password, lockout, refresh rotation, reuse detection and logout', async () => {
  const email = 'login@example.com'; const c0 = await register(base, email);
  const c = new Client(base);
  assert.equal((await c.post('/auth/login', { email, password: 'Wrong-password-1' })).status, 401);
  assert.equal((await c.post('/auth/login', { email: 'nobody@example.com', password: PW })).status, 401);
  assert.equal((await c.post('/auth/login', { email, password: PW })).status, 200);
  const oldRt = c.cookies.nexus_rt; const r1 = await c.post('/auth/refresh'); assert.equal(r1.status, 200); assert.notEqual(c.cookies.nexus_rt, oldRt);
  const attacker = new Client(base); attacker.cookies.nexus_rt = oldRt;
  assert.equal((await attacker.post('/auth/refresh')).status, 401, 'used refresh token rejected');
  assert.equal((await c.get('/auth/me')).status, 401, 'reuse revoked every session');
  const d = new Client(base); for (let i = 0; i < 5; i++) await d.post('/auth/login', { email, password: 'Wrong-password-1' });
  assert.equal((await d.post('/auth/login', { email, password: PW })).status, 403, 'locked after 5 failures');
  const e = await register(base, 'out@example.com'); assert.equal((await e.post('/auth/logout')).status, 200); assert.equal((await e.get('/auth/me')).status, 401);
  void c0;
});

test('mobile clients get tokens in the body and can use Bearer auth', async () => {
  await register(base, 'mob@example.com');
  const m = new Client(base, { 'x-nexus-client': 'mobile' }); const r = await m.post('/auth/login', { email: 'mob@example.com', password: PW });
  const bearer = new Client(base, { authorization: 'Bearer ' + r.body.accessToken }); assert.equal((await bearer.get('/auth/me')).status, 200);
  assert.equal((await new Client(base, { authorization: 'Bearer garbage' }).get('/auth/me')).status, 401);
});

test('first journey: profile, directory, eligibility, readiness, matches, save, business plan', async () => {
  const c = await register(base, 'journey@example.com');
  // empty account: honest onboarding, no invented numbers
  let dash = (await c.get('/dashboard')).body; assert.equal(dash.business, null); assert.equal(dash.activeVerified, 0); assert.equal(dash.activeDemo, 3); assert.ok(dash.onboarding.length > 0);
  // business profile
  const biz = (await c.post('/businesses', { name: 'GreenHarvest Namibia', profile: { sector: 'AGRICULTURE', stage: 'START_UP', region: 'Khomas', registrationStatus: 'REGISTERED', yearsInOperation: 1, employees: 4, fundingPurpose: 'EQUIPMENT', fundingRequiredNad: 150000, applicantTypes: ['YOUTH'] } })).body;
  assert.ok(biz.id); assert.ok(biz.profileCompletion > 50 && biz.profileCompletion < 100);
  assert.equal((await c.post('/businesses', { name: 'X', profile: { sector: 'MAGIC' } })).status, 400);
  // directory: drafts (unverified institution shells) hidden from citizens; demos labelled
  const list = (await c.get('/programmes')).body; assert.equal(list.total, 3); assert.ok(list.items.every((p: any) => p.verificationStatus === 'DEMONSTRATION' && /DEMONSTRATION RECORD/.test(p.sourceNote)));
  assert.equal((await c.get('/programmes?verification=VERIFIED')).body.total, 0);
  assert.equal((await c.get('/programmes?q=agriculture')).body.total, 1);
  assert.equal((await c.get('/programmes?sector=RENEWABLE_ENERGY')).body.items[0].name, 'DEMO: Green Business Innovation Grant');
  const names = (await c.get('/programmes?sort=name')).body.items.map((p: any) => p.name); assert.deepEqual(names, [...names].sort());
  const draft = await prisma.fundingProgramme.findFirstOrThrow({ where: { status: 'DRAFT' } }); assert.equal((await c.get('/programmes/' + draft.id)).status, 404);
  const youth = list.items.find((p: any) => /Youth/.test(p.name));
  const detail = (await c.get('/programmes/' + youth.id)).body; assert.ok(detail.criteria.length >= 4); assert.ok(detail.documents.length === 3);
  // readiness
  assert.equal((await c.post(`/businesses/${biz.id}/readiness`, { answers: { bp_exec: 'MAYBE' } })).status, 400);
  const rd = (await c.post(`/businesses/${biz.id}/readiness`, { answers: { bp_exec: 'YES', bp_desc: 'YES', bp_prod: 'PARTIAL', fin_forecast: 'NO', doc_reg: 'YES' } })).body;
  assert.ok(rd.overall > 0 && rd.overall < 30); assert.ok(rd.nextActions.length > 0); assert.match(rd.notice, /does not predict/);
  assert.equal((await c.get(`/businesses/${biz.id}/readiness/latest`)).body.overall, rd.overall);
  // matching with explanations
  const m = (await c.get(`/businesses/${biz.id}/matches`)).body; assert.equal(m.length, 3);
  const y = m.find((r: any) => /Youth/.test(r.programmeName)); assert.equal(y.status, 'MEETS_PUBLISHED_CRITERIA'); assert.equal(y.score, 100);
  assert.deepEqual(y.missingDocuments.map((d: any) => d.category).sort(), ['BUSINESS_PLAN', 'IDENTIFICATION', 'SUPPLIER_QUOTATIONS']); assert.match(y.disclaimer, /not a probability of approval/);
  const g = m.find((r: any) => /Green/.test(r.programmeName)); assert.equal(g.status, 'MANDATORY_NOT_MET'); assert.ok(g.unmet[0].explanation.includes('Agriculture'));
  assert.equal(m[0].score >= m[m.length - 1].score, true);
  assert.equal(await prisma.eligibilityAssessment.count({ where: { businessId: biz.id } }), 3, 'assessments persisted');
  // a document in the vault changes the missing list
  await prisma.document.create({ data: { businessId: biz.id, category: 'IDENTIFICATION', name: 'ID', createdById: (await prisma.user.findFirstOrThrow({ where: { email: 'journey@example.com' } })).id } });
  assert.equal((await c.get(`/businesses/${biz.id}/matches/${youth.id}`)).body.missingDocuments.length, 2);
  // save
  assert.equal((await c.put(`/programmes/${youth.id}/save`)).body.saved, true); assert.equal((await c.get('/me/saved-programmes')).body.length, 1);
  assert.equal((await c.get('/programmes/' + youth.id)).body.saved, true);
  // plan
  const plan = (await c.post(`/businesses/${biz.id}/plans`, {})).body; assert.equal(plan.sectionList.length, 16); assert.equal(plan.completion.percent, 0); assert.match(plan.title, /GreenHarvest/);
  const text = 'GreenHarvest grows and packs vegetables for Windhoek shops. '.repeat(4);
  const s1 = await c.patch(`/plans/${plan.id}/sections/EXECUTIVE_SUMMARY`, { text, baseVersion: plan.version }); assert.equal(s1.status, 200); assert.equal(s1.body.version, 2); assert.equal(s1.body.completion.complete, 1);
  assert.equal((await c.patch(`/plans/${plan.id}/sections/EXECUTIVE_SUMMARY`, { text: 'stale', baseVersion: 1 })).status, 409, 'stale edit never overwrites');
  assert.equal((await c.patch(`/plans/${plan.id}/sections/NOPE`, { text: 'x', baseVersion: 2 })).status, 400);
  assert.equal((await c.patch(`/plans/${plan.id}/sections/RISK_ANALYSIS`, { text: 'short', baseVersion: 2, snapshot: true })).status, 200);
  assert.equal((await c.get(`/plans/${plan.id}/versions`)).body.length, 2);
  // dashboard now reflects real database state
  dash = (await c.get('/dashboard')).body;
  assert.equal(dash.business.name, 'GreenHarvest Namibia'); assert.equal(dash.savedCount, 1); assert.equal(dash.readiness.overall, rd.overall); assert.equal(dash.plan.percent, Math.round(100 / 16));
  assert.equal(dash.matchingCount, 2, 'Youth and Agriculture demos both meet the published criteria'); assert.equal(dash.upcomingDeadlines.length, 1); assert.ok(dash.outstandingTasks > 0);
  assert.equal((await c.del(`/programmes/${youth.id}/save`)).body.saved, false);
  assert.ok(await prisma.auditLog.count({ where: { action: 'business.create' } }) >= 1);
});

test('organisation isolation: users cannot read or change each other\'s records', async () => {
  const a = await register(base, 'owner-a@example.com'), b = await register(base, 'owner-b@example.com');
  const biz = (await a.post('/businesses', { name: 'A Co', profile: { sector: 'TOURISM' } })).body;
  const plan = (await a.post(`/businesses/${biz.id}/plans`, {})).body;
  assert.equal((await b.get('/businesses/' + biz.id)).status, 404);
  assert.equal((await b.put('/businesses/' + biz.id, { name: 'hijacked' })).status, 404);
  assert.equal((await b.get(`/businesses/${biz.id}/matches`)).status, 404);
  assert.equal((await b.post(`/businesses/${biz.id}/readiness`, { answers: {} })).status, 404);
  assert.equal((await b.get(`/businesses/${biz.id}/readiness/latest`)).status, 404);
  assert.equal((await b.post(`/businesses/${biz.id}/plans`, {})).status, 404);
  assert.equal((await b.get('/plans/' + plan.id)).status, 404);
  assert.equal((await b.patch(`/plans/${plan.id}/sections/EXECUTIVE_SUMMARY`, { text: 'x', baseVersion: 1 })).status, 404);
  assert.deepEqual((await b.get('/businesses')).body, []);
  assert.equal((await b.get('/dashboard')).body.business, null);
  assert.equal((await a.get('/businesses/' + biz.id)).body.name, 'A Co');
});

test('role enforcement on the backend: citizens cannot manage programmes; admins can, and verification needs a source', async () => {
  const cit = await register(base, 'cit@example.com'); const admin = await makeAdmin(prisma, base, 'admin@example.com');
  const body = { name: 'Real Programme Record', institutionName: 'Some Institution', category: 'SME financing', criteria: [{ kind: 'SECTOR', values: ['TOURISM'], mandatory: true }] };
  assert.equal((await cit.post('/programmes', body)).status, 403);
  const created = (await admin.c.post('/programmes', { ...body, status: 'OPEN' })).body; assert.equal(created.verificationStatus, 'UNVERIFIED');
  const biz = (await cit.post('/businesses', { name: 'T Co', profile: { sector: 'TOURISM' } })).body;
  const m = (await cit.get(`/businesses/${biz.id}/matches`)).body.find((r: any) => r.programmeId === created.id);
  assert.equal(m.status, 'UNVERIFIED'); assert.equal(m.score, null, 'unverified programmes never show a percentage');
  assert.equal((await cit.post(`/programmes/${created.id}/verify`)).status, 403);
  assert.equal((await admin.c.post(`/programmes/${created.id}/verify`)).status, 400, 'no official source recorded');
  await admin.c.patch(`/programmes/${created.id}`, { websiteUrl: 'https://example.org/programme', sourceNote: 'Checked on the published programme page' });
  const v = (await admin.c.post(`/programmes/${created.id}/verify`)).body; assert.equal(v.verificationStatus, 'VERIFIED'); assert.ok(v.lastVerifiedAt);
  assert.equal((await cit.get(`/businesses/${biz.id}/matches/${created.id}`)).body.score, 100);
  const edited = (await admin.c.patch(`/programmes/${created.id}`, { description: 'changed' })).body; assert.equal(edited.verificationStatus, 'UNVERIFIED', 'editing resets verification'); assert.equal(edited.version, 3);
  const demo = await prisma.fundingProgramme.findFirstOrThrow({ where: { verificationStatus: 'DEMONSTRATION' } }); assert.equal((await admin.c.post(`/programmes/${demo.id}/verify`)).status, 400);
  assert.equal((await admin.c.get('/programmes?status=DRAFT')).body.items.length, 5, 'admins see the draft institution records');
  assert.ok(await prisma.auditLog.count({ where: { action: 'programme.verify' } }) === 1);
});

test('suspended users lose access immediately', async () => {
  const c = await register(base, 'susp@example.com'); assert.equal((await c.get('/auth/me')).status, 200);
  await prisma.user.update({ where: { email: 'susp@example.com' }, data: { status: 'SUSPENDED' } });
  assert.equal((await c.get('/auth/me')).status, 401);
});
