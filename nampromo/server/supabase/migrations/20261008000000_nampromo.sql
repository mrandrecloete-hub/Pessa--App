-- NamPromo database (Supabase / PostgreSQL). Apply once in a new Supabase project: SQL editor, or `supabase db push`.
-- Read it first. Service role keys stay on the server and are never put in the app.
create extension if not exists pgcrypto;

create type public.user_role as enum ('shopper','operator','moderator','admin');
create type public.review_status as enum ('pending','verified','rejected','suspended');
create type public.promo_status as enum ('pending_review','published','rejected','expired','archived');
create type public.msg_channel as enum ('whatsapp','sms','email');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.user_role not null default 'shopper',
  created_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))) on conflict do nothing; return new; end $$;
-- on Supabase: create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- true for the database owner and the service role (server code), false for app users. Uses the active role, so it also works inside security definer functions.
create function public.is_trusted() returns boolean language sql stable as $$
  select coalesce(nullif(current_setting('role', true), ''), 'none') in ('none','postgres','service_role','supabase_admin')
$$;
create function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator','admin'))
$$;
create function public.guard_profile() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Only an admin can change a role';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

create table public.categories (name text primary key, sort int not null default 0);
insert into public.categories(name, sort) values
 ('Food and groceries',1),('Home and household',2),('Clothing and shoes',3),('Electronics',4),('Building and hardware',5),
 ('Health and beauty',6),('Restaurants and takeaways',7),('Farming and agri',8),('Vehicles and parts',9),('Other',10);
create table public.towns (name text primary key, lat double precision not null, lng double precision not null);
insert into public.towns(name, lat, lng) values
 ('Windhoek',-22.5609,17.0658),('Swakopmund',-22.6784,14.5266),('Walvis Bay',-22.9576,14.5053),('Oshakati',-17.788,15.6995),('Rundu',-17.9333,19.7667),
 ('Katima Mulilo',-17.5,24.27),('Otjiwarongo',-20.4637,16.6477),('Keetmanshoop',-26.5833,18.1333),('Gobabis',-22.45,18.97);

-- shops: every operator who lists. They show as "not yet checked" (pending) until a moderator verifies them.
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) >= 2),
  category text not null references public.categories(name),
  town text not null references public.towns(name),
  address text not null check (length(trim(address)) >= 3),
  lat double precision, lng double precision,
  contact_name text not null, contact_email text not null,
  contact_phone text not null check (contact_phone ~ '^\+2648[0-9]{8}$'),
  registration_number text,
  status public.review_status not null default 'pending',
  review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index shops_town_cat_idx on public.shops(town, category);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (length(trim(title)) >= 2),
  product_key text,
  category text not null references public.categories(name),
  regular_price numeric(12,2) not null check (regular_price > 0),
  sale_price numeric(12,2) not null check (sale_price >= 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status public.promo_status not null default 'pending_review',
  source_type text not null default 'shop' check (source_type in ('shop','community','admin')),
  submitted_by uuid references auth.users(id) on delete set null,
  review_note text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (sale_price < regular_price), check (expires_at > starts_at)
);
create index promotions_live_idx on public.promotions(status, expires_at, category);

create table public.saved_promotions (
  user_id uuid not null references auth.users(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id, promotion_id)
);
create table public.price_watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_key text not null, town text not null references public.towns(name),
  target_price numeric(12,2) not null check (target_price >= 0),
  created_at timestamptz not null default now(), unique (user_id, product_key, town)
);

-- messaging: written only by the Edge Functions with the service role (no public policies on purpose)
create table public.subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null, email text not null,
  cellphone text not null unique check (cellphone ~ '^\+2648[0-9]{8}$'),
  town text references public.towns(name),
  categories text[] not null default '{}',
  whatsapp_opt_in boolean not null default false, sms_opt_in boolean not null default false, email_opt_in boolean not null default false,
  verified_at timestamptz, verify_hash text, verify_expires timestamptz, verify_attempts int not null default 0,
  stopped_at timestamptz, created_at timestamptz not null default now()
);
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  channel public.msg_channel not null, wording text not null,
  given_at timestamptz not null default now(), withdrawn_at timestamptz
);
create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  channel public.msg_channel not null,
  kind text not null check (kind in ('verify','deal','alert','service')),
  body text not null, dedupe_key text,
  status text not null default 'queued' check (status in ('queued','sent','failed','blocked')),
  error text, created_at timestamptz not null default now(), sent_at timestamptz,
  unique (subscriber_id, channel, dedupe_key)
);
create index outbound_queue_idx on public.outbound_messages(status, created_at);
create table public.dispatch_state (key text primary key, value text not null);

-- guards: never trust the client for status fields
create function public.promo_before_insert() returns trigger language plpgsql security definer set search_path = public as $$
declare s public.shops%rowtype;
begin
  select * into s from public.shops where id = new.shop_id;
  if not found then raise exception 'Unknown shop'; end if;
  if public.is_trusted() then return new; end if;
  new.submitted_by := auth.uid(); new.review_note := null; new.reviewed_by := null; new.reviewed_at := null;
  if s.owner_id = auth.uid() then
    new.source_type := 'shop';
    new.status := case when s.status = 'verified' then 'published' else 'pending_review' end;
  else
    new.source_type := 'community'; new.status := 'pending_review';
  end if;
  return new;
end $$;
create trigger promotions_insert_guard before insert on public.promotions for each row execute function public.promo_before_insert();

create function public.review_fields_guard() returns trigger language plpgsql as $$
begin
  -- invoker function: inside moderate_shop / moderate_promotion current_user is the function owner, for app users it is their own role
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if new.status is distinct from old.status or new.review_note is distinct from old.review_note or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Status changes go through a moderator';
  end if;
  if tg_table_name = 'shops' then new.updated_at := now(); end if;
  return new;
end $$;
create trigger shops_review_guard before update on public.shops for each row execute function public.review_fields_guard();
create trigger promotions_review_guard before update on public.promotions for each row execute function public.review_fields_guard();

-- moderation (moderators and admins only)
create function public.moderate_shop(p_id uuid, p_decision text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Moderators only'; end if;
  if p_decision not in ('verified','rejected','suspended') then raise exception 'Decision must be verified, rejected or suspended'; end if;
  update public.shops set status = p_decision::public.review_status, review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_id;
  if not found then raise exception 'Unknown shop'; end if;
end $$;
create function public.moderate_promotion(p_id uuid, p_decision text, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Moderators only'; end if;
  if p_decision not in ('publish','reject') then raise exception 'Decision must be publish or reject'; end if;
  update public.promotions set status = case when p_decision = 'publish' then 'published'::public.promo_status else 'rejected'::public.promo_status end,
    review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  if not found then raise exception 'Unknown promotion'; end if;
end $$;
create function public.expire_promotions() returns int language plpgsql security definer set search_path = public as $$
declare n int; begin update public.promotions set status = 'expired' where status = 'published' and expires_at < now(); get diagnostics n = row_count; return n; end $$;
revoke all on function public.expire_promotions() from public;

-- what the public app may read: no contact details, only published and unexpired promotions
create view public.public_shops as
  select id, name, category, town, address, lat, lng, (status = 'verified') as verified, status from public.shops where status in ('pending','verified');
create view public.public_promotions as
  select p.id, p.shop_id, p.title, p.product_key, p.category, p.regular_price, p.sale_price, p.starts_at, p.expires_at, p.source_type, (s.status = 'verified') as shop_verified
  from public.promotions p join public.shops s on s.id = p.shop_id
  where p.status = 'published' and p.expires_at > now() and p.starts_at <= now() and s.status in ('pending','verified');

-- row level security
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.promotions enable row level security;
alter table public.saved_promotions enable row level security;
alter table public.price_watches enable row level security;
alter table public.subscribers enable row level security;
alter table public.consents enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.dispatch_state enable row level security;
alter table public.categories enable row level security;
alter table public.towns enable row level security;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy lookup_read_c on public.categories for select using (true);
create policy lookup_read_t on public.towns for select using (true);
create policy shops_read on public.shops for select using (owner_id = auth.uid() or public.is_staff());
create policy shops_insert on public.shops for insert with check (owner_id = auth.uid() and status = 'pending');
create policy shops_update on public.shops for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy promos_read on public.promotions for select using (submitted_by = auth.uid() or public.is_staff() or shop_id in (select id from public.shops where owner_id = auth.uid()));
create policy promos_insert on public.promotions for insert with check (auth.uid() is not null);
create policy promos_update on public.promotions for update using (submitted_by = auth.uid() and status = 'pending_review') with check (submitted_by = auth.uid());
create policy saved_all on public.saved_promotions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy watch_all on public.price_watches for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subscribers_own on public.subscribers for select using (user_id = auth.uid());

-- privileges (Supabase roles). Nothing here lets the public write messaging tables.
grant usage on schema public to anon, authenticated;
grant select on public.public_shops, public.public_promotions, public.categories, public.towns to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.shops, public.promotions to authenticated;
grant select, insert, delete on public.saved_promotions to authenticated;
grant select, insert, update, delete on public.price_watches to authenticated;
grant select on public.subscribers to authenticated;
grant execute on function public.moderate_shop(uuid, text, text), public.moderate_promotion(uuid, text, text) to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
