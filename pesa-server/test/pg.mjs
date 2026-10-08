// Starts a throw away local PostgreSQL, creates the Supabase roles, and applies the platform migration.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
export const BIN = process.env.PGBIN || ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/lib/postgresql/14/bin', '/usr/bin'].find(d => existsSync(d + '/initdb'));
export const MIGRATION = path.join(here, '..', 'supabase', 'migrations', '20261008100000_platform.sql');
const isRoot = process.getuid && process.getuid() === 0;
export function startPg(port){
  const DIR = '/tmp/pesa_pg_' + port;
  const run = (cmd, args) => isRoot ? spawnSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { encoding:'utf8' }) : spawnSync(cmd, args, { encoding:'utf8' });
  rmSync(DIR, { recursive:true, force:true });
  let r = run(BIN + '/initdb', ['-D', DIR, '-A', 'trust', '-U', 'postgres']); if(r.status) throw new Error(r.stderr);
  r = run(BIN + '/pg_ctl', ['-D', DIR, '-o', `-p ${port} -k /tmp -c listen_addresses=''`, '-w', 'start', '-l', DIR + '/log']); if(r.status) throw new Error(r.stdout + r.stderr);
  const psql = (sql, db = 'postgres') => spawnSync(BIN + '/psql', ['-X', '-A', '-t', '-q', '-h', '/tmp', '-p', String(port), '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding:'utf8' });
  psql('create database pp');
  const s = psql('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;', 'pp'); if(s.status) throw new Error(s.stderr);
  const f = spawnSync(BIN + '/psql', ['-X', '-q', '-h', '/tmp', '-p', String(port), '-U', 'postgres', '-d', 'pp', '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION], { encoding:'utf8' });
  return { psql: (sql) => psql(sql, 'pp'), migrated: f.status === 0, migrateError: f.stderr, socket: `/tmp/.s.PGSQL.${port}`, stop(){ run(BIN + '/pg_ctl', ['-D', DIR, '-m', 'immediate', 'stop']); rmSync(DIR, { recursive:true, force:true }); } };
}
