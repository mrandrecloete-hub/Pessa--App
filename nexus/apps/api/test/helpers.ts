import { execSync } from 'child_process';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgresql://nexus:nexus_dev_password@localhost:5432/nexus_test?schema=public';
process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_secret_value_that_is_long_enough_0123456789';

export async function boot() {
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: 'pipe' });
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`);
  const { createApp } = await import('../src/setup');
  const app: INestApplication = await createApp(); await app.listen(0);
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}/api/v1`;
  return { app, prisma, base };
}
/** Minimal browser: keeps cookies, like the web app does. */
export class Client {
  cookies: Record<string, string> = {};
  constructor(public base: string, private headers: Record<string, string> = {}) {}
  async req(method: string, path: string, body?: unknown) {
    const r = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...this.headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of (r.headers as any).getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)) delete this.cookies[k]; else this.cookies[k] = v; }
    const text = await r.text(); let json: any; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json, headers: r.headers };
  }
  get = (p: string) => this.req('GET', p); post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {}); patch = (p: string, b: unknown) => this.req('PATCH', p, b); del = (p: string) => this.req('DELETE', p);
}
export const PW = 'Sunrise-Namib-2026';
export async function register(base: string, email: string, first = 'Thandi') {
  const c = new Client(base); const r = await c.post('/auth/register', { email, password: PW, firstName: first, lastName: 'Katjua' }); if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.body)); return c;
}
export async function makeAdmin(prisma: PrismaClient, base: string, email: string) {
  const u = await prisma.user.create({ data: { email, passwordHash: await hashPassword(PW), firstName: 'Admin', lastName: 'User', profile: { create: {} }, roles: { create: { role: 'NATIONAL_ADMIN' } } } });
  const c = new Client(base); const r = await c.post('/auth/login', { email, password: PW }); if (r.status !== 200) throw new Error('admin login failed'); return { c, id: u.id };
}
