// Database access for the NamPromo Edge Functions. `sql` is a postgres.js client connected as the server (it is created in each function from SUPABASE_DB_URL).
// Tested against a real PostgreSQL in server/test/flow_test.mjs.
export function makeDb(sql){
  const one = (rows) => rows[0] || null;
  return {
    async getSubscriberByPhone(phone){ return one(await sql`select * from public.subscribers where cellphone = ${phone}`); },
    async insertSubscriber(r){
      return one(await sql`insert into public.subscribers (full_name, email, cellphone, town, categories, whatsapp_opt_in, sms_opt_in, email_opt_in, verify_expires, verify_attempts)
        values (${r.full_name}, ${r.email}, ${r.cellphone}, ${r.town}, ${sql.array(r.categories)}, ${r.whatsapp_opt_in}, ${r.sms_opt_in}, ${r.email_opt_in}, ${r.verify_expires}, ${r.verify_attempts}) returning *`);
    },
    async updateSubscriber(id, p){
      const q = Object.assign({}, p); if(q.categories) q.categories = sql.array(q.categories);
      return one(await sql`update public.subscribers set ${sql(q, ...Object.keys(q))} where id = ${id} returning *`);
    },
    async countVerifyMessagesSince(id, iso){ return Number((await sql`select count(*)::int as n from public.outbound_messages where subscriber_id = ${id} and kind = 'verify' and created_at > ${iso}`)[0].n); },
    async queueMessage(m){
      return one(await sql`insert into public.outbound_messages (subscriber_id, channel, kind, body, dedupe_key) values (${m.subscriber_id}, ${m.channel}, ${m.kind}, ${m.body}, ${m.dedupe_key || null})
        on conflict (subscriber_id, channel, dedupe_key) do nothing returning *`);
    },
    async markMessage(id, p){ await sql`update public.outbound_messages set status = ${p.status}, error = ${p.error || null}, sent_at = case when ${p.status} = 'sent' then now() else sent_at end where id = ${id}`; },
    async markVerified(id, channels, wording, iso){
      await sql.begin(async (tx) => {
        await tx`update public.subscribers set verified_at = ${iso}, verify_hash = null, verify_expires = null, verify_attempts = 0, stopped_at = null where id = ${id}`;
        await tx`update public.consents set withdrawn_at = ${iso} where subscriber_id = ${id} and withdrawn_at is null`;
        for(const c of channels) await tx`insert into public.consents (subscriber_id, channel, wording, given_at) values (${id}, ${c}, ${wording}, ${iso})`;
      });
    },
    async stopSubscriber(phone, iso){
      const s = one(await sql`update public.subscribers set stopped_at = ${iso}, whatsapp_opt_in = false, sms_opt_in = false, email_opt_in = false where cellphone = ${phone} returning *`);
      if(s) await sql`update public.consents set withdrawn_at = ${iso} where subscriber_id = ${s.id} and withdrawn_at is null`;
      return s;
    },
    async expirePromotions(){ return Number((await sql`select public.expire_promotions() as n`)[0].n); },
    async getState(k){ const r = one(await sql`select value from public.dispatch_state where key = ${k}`); return r ? r.value : null; },
    async setState(k, v){ await sql`insert into public.dispatch_state (key, value) values (${k}, ${v}) on conflict (key) do update set value = excluded.value`; },
    async listPublishedSince(iso){
      return sql`select p.id, p.title, p.category, p.regular_price::float8 as regular_price, p.sale_price::float8 as sale_price, s.name as shop_name, s.town
        from public.promotions p join public.shops s on s.id = p.shop_id
        where p.status = 'published' and p.expires_at > now() and s.status in ('pending','verified') and greatest(p.created_at, coalesce(p.reviewed_at, p.created_at)) > ${iso}`;
    },
    async listActiveSubscribers(){
      return sql`select * from public.subscribers where verified_at is not null and stopped_at is null and (whatsapp_opt_in or sms_opt_in or email_opt_in)`;
    },
    async listWatchHits(){
      return sql`select w.id as watch_id, s.id as subscriber_id, s.whatsapp_opt_in, s.sms_opt_in, s.email_opt_in, x.title, x.price, x.shop_name, x.town
        from public.price_watches w
        join public.subscribers s on s.user_id = w.user_id and s.verified_at is not null and s.stopped_at is null
        join lateral (select p.title, p.sale_price::float8 as price, sh.name as shop_name, sh.town from public.promotions p join public.shops sh on sh.id = p.shop_id
          where p.product_key = w.product_key and sh.town = w.town and p.status = 'published' and p.expires_at > now() and p.sale_price <= w.target_price order by p.sale_price limit 1) x on true`;
    },
    async listQueued(limit){
      return sql`select m.id, m.subscriber_id, m.channel, m.kind, m.body, s.cellphone, s.email, s.whatsapp_opt_in, s.sms_opt_in, s.email_opt_in, s.stopped_at, s.verified_at
        from public.outbound_messages m join public.subscribers s on s.id = m.subscriber_id where m.status = 'queued' order by m.created_at limit ${limit}`;
    },
  };
}
