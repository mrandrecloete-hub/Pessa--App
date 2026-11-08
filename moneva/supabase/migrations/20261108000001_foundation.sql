-- MONEVA foundation: identity, currencies, accounts, categories, merchants, transactions.
-- Every user-owned table has Row Level Security. Money is numeric, never float.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency char(3) not null default 'NAD',
  country_code char(2) default 'NA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system','light','dark')),
  budget_method text not null default '50/30/20' check (budget_method in ('50/30/20','60/20/20','custom')),
  alert_progress smallint not null default 50 check (alert_progress between 1 and 100),
  alert_warning smallint not null default 75 check (alert_warning between 1 and 100),
  alert_strong smallint not null default 90 check (alert_strong between 1 and 100),
  updated_at timestamptz not null default now(),
  check (alert_progress < alert_warning and alert_warning < alert_strong)
);

create table public.currencies (
  code char(3) primary key,
  name text not null,
  minor_units smallint not null check (minor_units between 0 and 4),
  symbol text not null,
  enabled boolean not null default true
);

create table public.exchange_rate_sources (
  id text primary key,            -- e.g. 'manual', 'provider:xyz'
  description text not null
);

-- Historical rates are append-only: a stored rate is never rewritten.
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_code char(3) not null references public.currencies(code),
  quote_code char(3) not null references public.currencies(code),
  rate numeric(20,10) not null check (rate > 0),
  source_id text not null references public.exchange_rate_sources(id),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (base_code, quote_code, source_id, observed_at)
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null default 'bank' check (kind in ('cash','bank','mobile_wallet','savings','credit_card','other')),
  currency_code char(3) not null references public.currencies(code),
  opening_balance numeric(20,4) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,   -- null = system default
  slug text not null,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  parent_id uuid references public.transaction_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create unique index transaction_categories_system_slug on public.transaction_categories(slug) where user_id is null;

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  default_category_id uuid references public.transaction_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.transaction_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  source text not null check (source in ('csv','statement_text','payslip','bank')),
  file_name text,
  rows_read int not null default 0,
  rows_imported int not null default 0,
  rows_duplicate int not null default 0,
  rows_needing_review int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.financial_accounts(id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  transaction_type text not null check (transaction_type in ('income','expense','transfer_in','transfer_out','refund')),
  amount numeric(20,4) not null check (amount > 0),                 -- original amount, kept permanently
  currency_code char(3) not null references public.currencies(code),
  base_currency_code char(3) not null references public.currencies(code),
  exchange_rate numeric(20,10) not null check (exchange_rate > 0),   -- stored at transaction time, never rewritten
  exchange_rate_source text not null default 'identity',
  base_amount numeric(20,4) not null check (base_amount > 0),
  category_id uuid references public.transaction_categories(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete set null,
  transaction_date date not null,
  status text not null default 'settled' check (status in ('pending','settled','cancelled')),
  source text not null default 'manual' check (source in ('manual','bank','import','scan','recurring')),
  external_transaction_id text,                 -- bank id or import fingerprint
  idempotency_key text,
  import_batch_id uuid references public.transaction_import_batches(id) on delete set null,
  recurring_transaction_id uuid,
  refund_of uuid references public.transactions(id) on delete set null,
  is_savings_allocation boolean not null default false,
  needs_review boolean not null default false,
  confidence numeric(4,3) check (confidence between 0 and 1),
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.financial_accounts(id, user_id),
  check (currency_code <> base_currency_code or exchange_rate = 1)
);
-- Importing the same bank row or the same request twice cannot create a second record.
create unique index transactions_external_unique on public.transactions(user_id, source, external_transaction_id) where external_transaction_id is not null;
create unique index transactions_idempotency_unique on public.transactions(user_id, idempotency_key) where idempotency_key is not null;
create index transactions_user_date on public.transactions(user_id, transaction_date desc);
create index transactions_account on public.transactions(account_id, transaction_date desc);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_profiles_u before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_prefs_u before update on public.user_preferences for each row execute function public.touch_updated_at();
create trigger t_accounts_u before update on public.financial_accounts for each row execute function public.touch_updated_at();
create trigger t_tx_u before update on public.transactions for each row execute function public.touch_updated_at();

-- Balance of each account in the account's own currency. Only SETTLED rows count.
create view public.account_balances with (security_invoker = true) as
select a.id as account_id, a.user_id, a.currency_code,
  a.opening_balance + coalesce(sum(case
    when t.status <> 'settled' then 0
    when t.transaction_type in ('income','refund','transfer_in') then t.amount
    else -t.amount end), 0) as balance
from public.financial_accounts a
left join public.transactions t on t.account_id = a.id and t.user_id = a.user_id
group by a.id;

-- New users get a profile and preferences automatically.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id) values (new.id);
  insert into public.user_preferences(user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.merchants enable row level security;
alter table public.transaction_import_batches enable row level security;
alter table public.transactions enable row level security;
alter table public.currencies enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.exchange_rate_sources enable row level security;

create policy profiles_own on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy prefs_own on public.user_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_own on public.financial_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy merchants_own on public.merchants for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy batches_own on public.transaction_import_batches for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_own on public.transactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_read on public.transaction_categories for select to authenticated using (user_id is null or user_id = auth.uid());
create policy categories_write on public.transaction_categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Reference data: readable by signed in users, writable only by the service role (which bypasses RLS).
create policy currencies_read on public.currencies for select to authenticated using (true);
create policy rates_read on public.exchange_rates for select to authenticated using (true);
create policy rate_sources_read on public.exchange_rate_sources for select to authenticated using (true);
