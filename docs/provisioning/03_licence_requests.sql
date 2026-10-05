-- Run this once in the SQL Editor of YOUR OWN Supabase project (the one that runs the licence server).
-- It is separate from the shops' sync projects. Only the licence function (service role) can read or write it.
create table if not exists public.licence_requests (
  id          text primary key,
  ref         text not null,
  shop        text,
  email       text,
  plan        text not null,
  period      text not null default 'monthly',
  amount_due  numeric,
  status      text not null default 'pending',   -- pending, approved
  key         text,
  exp         text,
  from_date   text,
  paid_amount numeric,
  paid_date   text,
  method      text,
  bank_ref    text,
  seq         integer,
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists licence_requests_ref_idx on public.licence_requests (ref);
create index if not exists licence_requests_status_idx on public.licence_requests (status, created_at desc);
alter table public.licence_requests enable row level security;
-- No policies on purpose: the anon key can do nothing here. Only the licence function reads and writes it.
