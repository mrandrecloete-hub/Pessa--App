-- Run this once in the SQL Editor of YOUR OWN Supabase project (the one that runs the licence server).
-- It holds the pages that shops publish with Pesa Shop. Only the shop function (service role) can read or write it.
create table if not exists public.pesa_shops (
  slug        text primary key,                 -- the shop's name in its web address, for example mama-ndapewa
  token_hash  text not null,                    -- SHA-256 of the private token the shop keeps. The token itself is never stored
  ref         text not null default '',         -- the licence reference when licence keys are required
  shop        text not null,
  phone       text not null,
  intro       text not null default '',
  how         text not null default '',
  rows        jsonb not null default '[]'::jsonb,   -- plain products only: id, name, category, price, unit, stock band
  published   boolean not null default true,
  disabled    boolean not null default false,   -- set by you to take a page down
  ip_hash     text not null default '',         -- a one way hash of the network address, only to limit new shops per day
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists pesa_shops_ip_idx on public.pesa_shops (ip_hash, created_at);
alter table public.pesa_shops enable row level security;
-- No policies on purpose: the anon key can do nothing here. Only the shop function reads and writes it.
