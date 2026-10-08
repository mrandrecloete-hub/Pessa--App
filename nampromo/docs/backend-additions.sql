-- NamPromo additions for the server (review before use; extends backend-schema.sql)
create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  cellphone text not null check (cellphone ~ '^\+2648[0-9]{8}$'),
  town text,
  categories text[] not null default '{}',
  whatsapp_opt_in boolean not null default false,
  sms_opt_in boolean not null default false,
  email_opt_in boolean not null default false,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','sms','email')),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  wording text not null
);
create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','sms','email')),
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','blocked')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.subscribers enable row level security;
alter table public.consents enable row level security;
alter table public.outbound_messages enable row level security;
create policy subscribers_own on public.subscribers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy consents_own on public.consents for select using (subscriber_id in (select id from public.subscribers where user_id = auth.uid()));
-- outbound_messages is written only by a trusted server function using the service role, so no public policy is created.
