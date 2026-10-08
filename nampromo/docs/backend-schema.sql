-- NamPromo production database foundation (Supabase/PostgreSQL)
-- Apply only after creating a Supabase project and reviewing these policies.
create extension if not exists pgcrypto;

create type public.user_role as enum ('shopper','retailer','moderator','admin');
create type public.promotion_status as enum ('draft','pending_review','published','rejected','expired','archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  preferred_town text,
  role public.user_role not null default 'shopper',
  created_at timestamptz not null default now()
);

create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  business_name text not null,
  registration_reference text,
  contact_email text,
  contact_phone text,
  website_url text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.retailer_branches (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers(id) on delete cascade,
  branch_name text not null,
  town text not null,
  address text,
  latitude double precision,
  longitude double precision,
  opening_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid references public.retailers(id) on delete set null,
  branch_id uuid references public.retailer_branches(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text,
  category text not null check (category in ('Groceries','Fashion','Sneakers','Electronics','Restaurants','Black Friday','Home','Other')),
  product_brand text,
  product_model text,
  quantity_label text,
  regular_price numeric(12,2) not null check (regular_price > 0),
  sale_price numeric(12,2) not null check (sale_price >= 0 and sale_price <= regular_price),
  currency char(3) not null default 'NAD' check (currency = 'NAD'),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  status public.promotion_status not null default 'pending_review',
  source_type text not null default 'retailer_submission'
    check (source_type in ('retailer_submission','approved_public_source','community_submission','admin_created')),
  source_url text,
  source_attribution text,
  verification_note text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  terms text,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index promotions_active_idx on public.promotions(status, expires_at, category);
create index promotions_retailer_idx on public.promotions(retailer_id, created_at desc);
create index promotions_price_idx on public.promotions(sale_price);
create index branches_town_idx on public.retailer_branches(town);

create table public.saved_promotions (
  user_id uuid not null references auth.users(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, promotion_id)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'My shopping list',
  created_at timestamptz not null default now()
);
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  label text not null,
  quantity numeric(10,2),
  estimated_price numeric(12,2),
  is_checked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.promotion_reports (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('wrong_price','expired','wrong_details','suspected_scam','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table public.promotion_events (
  id bigint generated always as identity primary key,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  event_type text not null check (event_type in ('view','save','compare','outbound_click','report')),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Enable RLS before exposing tables to clients.
alter table public.profiles enable row level security;
alter table public.retailers enable row level security;
alter table public.retailer_branches enable row level security;
alter table public.promotions enable row level security;
alter table public.saved_promotions enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.promotion_reports enable row level security;
alter table public.promotion_events enable row level security;

-- Minimal initial policies. Production requires reviewed moderator/admin policies,
-- careful role assignment (never let a client self-promote to admin), and tests.
create policy "Profiles are readable by owner" on public.profiles
for select to authenticated using (auth.uid() = id);
create policy "Users can create own profile" on public.profiles
for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Public can read verified retailer records" on public.retailers
for select to anon, authenticated using (verification_status = 'verified' or owner_id = auth.uid());
create policy "Retailer owner can create retailer profile" on public.retailers
for insert to authenticated with check (owner_id = auth.uid());
create policy "Retailer owner can update own profile" on public.retailers
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "Public can read branches of verified retailers" on public.retailer_branches
for select to anon, authenticated using (
  exists(select 1 from public.retailers r where r.id = retailer_id and (r.verification_status = 'verified' or r.owner_id = auth.uid()))
);
create policy "Verified active promotions are public" on public.promotions
for select to anon, authenticated using (
  status = 'published' and starts_at <= now() and expires_at > now()
  or submitted_by = auth.uid()
  or exists(select 1 from public.retailers r where r.id = retailer_id and r.owner_id = auth.uid())
);
create policy "Retailers can submit own pending promotions" on public.promotions
for insert to authenticated with check (
  submitted_by = auth.uid() and status = 'pending_review'
  and exists(select 1 from public.retailers r where r.id = retailer_id and r.owner_id = auth.uid())
);
create policy "Owners can edit their own unpublished promotions" on public.promotions
for update to authenticated using (
  submitted_by = auth.uid() and status in ('draft','pending_review','rejected')
) with check (
  submitted_by = auth.uid() and status in ('draft','pending_review','rejected')
);

create policy "Users manage own saved promotions" on public.saved_promotions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own lists" on public.shopping_lists
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage items on own lists" on public.shopping_list_items
for all to authenticated using (
  exists(select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid())
) with check (
  exists(select 1 from public.shopping_lists l where l.id = list_id and l.user_id = auth.uid())
);
create policy "Users can submit promotion reports" on public.promotion_reports
for insert to authenticated with check (reporter_id = auth.uid());
create policy "Users can read own reports" on public.promotion_reports
for select to authenticated using (reporter_id = auth.uid());
create policy "Authenticated users can log non-sensitive events" on public.promotion_events
for insert to authenticated with check (user_id = auth.uid());
