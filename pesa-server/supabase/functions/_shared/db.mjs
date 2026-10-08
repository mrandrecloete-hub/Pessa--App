// Database access for the Pesa platform functions. `sql` is a postgres.js client connected as the server.
export function makeDb(sql){
  const one = (r) => r[0] || null;
  return {
    getUser: async (u) => one(await sql`select * from public.dev_users where username = ${u}`),
    listUsers: () => sql`select username, name, role, active, created_at from public.dev_users order by created_at`,
    insertUser: async (u) => { await sql`insert into public.dev_users (username, name, role, salt, hash, iterations, created_by) values (${u.username}, ${u.name}, ${u.role}, ${u.salt}, ${u.hash}, ${u.iterations}, ${u.created_by || null})`; },
    setActive: async (u, on) => { await sql`update public.dev_users set active = ${on} where username = ${u}`; },
    audit: async (r) => { await sql`insert into public.dev_audit (username, action, ok, detail) values (${r.username}, ${r.action}, ${r.ok}, ${r.detail || ''})`; },
    getAttempt: async (k) => one(await sql`select n, until from public.dev_attempts where key = ${k}`),
    setAttempt: async (k, n, until) => { await sql`insert into public.dev_attempts (key, n, until) values (${k}, ${n}, ${until}) on conflict (key) do update set n = excluded.n, until = excluded.until`; },
    clearAttempt: async (k) => { await sql`delete from public.dev_attempts where key = ${k}`; },
    getShopByKeyHash: async (h) => one(await sql`select * from public.shops where api_key_hash = ${h}`),
    isSuppressed: async (p) => !!one(await sql`select 1 from public.suppression where phone = ${p}`),
    addSuppression: async (p) => { await sql`insert into public.suppression (phone) values (${p}) on conflict do nothing`; },
    countSendsSince: async (shopId, iso) => Number((await sql`select count(*)::int as n from public.sends where shop_id = ${shopId} and created_at >= ${iso} and status in ('sent','failed')`)[0].n),
    logSend: async (r) => { await sql`insert into public.sends (shop_id, channel, to_phone, body, consent_attested, status, error, created_at) values (${r.shop_id}, ${r.channel}, ${r.to_phone}, ${r.body}, ${r.consent_attested}, ${r.status}, ${r.error || null}, ${r.at || new Date().toISOString()})`; },
  };
}
