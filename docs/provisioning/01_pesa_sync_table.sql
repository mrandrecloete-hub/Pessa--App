-- Pesa cloud table. Run this once in the SQL Editor of the shop's own Supabase project.
-- It is the same script as Settings, Advanced Pesa Connection settings, Copy setup script.
-- Safe to run again. The file is checked against the app by `npm run check`, so do not edit it by hand: change SYNC_SQL in index.html and re-export.

create table if not exists pesa_docs (
  ws text not null, coll text not null, id text not null,
  data jsonb, deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (ws, coll, id)
);
create index if not exists pesa_docs_pull on pesa_docs (ws, updated_at);
create or replace function pesa_touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists pesa_touch_trg on pesa_docs;
create trigger pesa_touch_trg before insert or update on pesa_docs for each row execute function pesa_touch();
alter table pesa_docs enable row level security;
drop policy if exists pesa_all on pesa_docs;
create policy pesa_all on pesa_docs for all to anon
  using (ws = coalesce(current_setting('request.headers', true)::json->>'x-pesa-code',''))
  with check (ws = coalesce(current_setting('request.headers', true)::json->>'x-pesa-code',''));
revoke all on pesa_docs from anon, authenticated;
grant select, insert, update, delete on pesa_docs to anon;
alter table pesa_docs drop constraint if exists pesa_ws_len;
alter table pesa_docs add constraint pesa_ws_len check (char_length(replace(ws, '-', '')) >= 16) not valid;
alter table pesa_docs drop constraint if exists pesa_size;
alter table pesa_docs add constraint pesa_size check (data is null or pg_column_size(data) < 2000000) not valid;
