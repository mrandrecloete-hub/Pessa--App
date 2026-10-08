-- Pesa platform server (the developer's own Supabase project). Apply once. Read it first.
-- It holds NO shop sales, stock or customer data. It holds: developer logins, shop accounts for sending, and a do not message list.
-- Every table is locked (row level security, no policies). Only the Edge Functions, using the service role, read or write them.
create extension if not exists pgcrypto;

-- developer logins (the Developer panel in the app signs in against this, not against a password inside the app)
create table public.dev_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username = lower(username) and length(username) >= 3),
  name text, role text not null check (role in ('master','helper')),
  salt text not null, hash text not null, iterations int not null default 210000,
  active boolean not null default true, created_at timestamptz not null default now(), created_by text
);
create table public.dev_audit (id bigserial primary key, at timestamptz not null default now(), username text, action text not null, ok boolean not null, detail text);
create table public.dev_attempts (key text primary key, n int not null default 0, until timestamptz);

-- shops that use the central sending service
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null, owner_email text,
  api_key_hash text not null unique,           -- sha256 of the shop's key; the key itself is shown once and never stored
  plan text not null default 'starter' check (plan in ('starter','business','premium')),
  daily_limit int not null default 50 check (daily_limit >= 0),
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.suppression (phone text primary key check (phone ~ '^\+[0-9]{8,15}$'), reason text not null default 'stop', at timestamptz not null default now());
create table public.sends (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','sms')),
  to_phone text not null, body text not null,
  consent_attested boolean not null default false,
  status text not null check (status in ('sent','failed','blocked','suppressed')), error text,
  created_at timestamptz not null default now()
);
create index sends_shop_day on public.sends(shop_id, created_at);

alter table public.dev_users enable row level security;
alter table public.dev_audit enable row level security;
alter table public.dev_attempts enable row level security;
alter table public.shops enable row level security;
alter table public.suppression enable row level security;
alter table public.sends enable row level security;
-- no policies on purpose: the public anon key can read and write nothing here
revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
