-- Pesa fiscal layer (NamRA ITARIS / ITAS) -- migration 001
-- Run once in the shop's own Supabase project (SQL editor), after the Pesa sync table (pesa_docs) exists.
-- Safe to run again. Needs Postgres 15 or newer (Supabase default).
--
-- STATUS: NamRA has not published an e-invoicing specification. Column names that mention namra_* and the JSON
-- payload shape are MOCK placeholders. The schema keeps the authority's answer in three plain columns plus the full
-- payload, so a later specification changes the adapter, not these tables.
--
-- DATA FLOW
--   Pesa app (offline first)  ->  pesa_docs, coll 'fiscalOutbox'  ->  trigger pesa_fiscal_project()  ->  fiscal_* tables
-- The app keeps writing one generic table. The trigger copies each receipt into typed tables with checks that the
-- app cannot bypass. The app can read the fiscal tables but cannot write them directly.

begin;

-- ---------------------------------------------------------------- types
do $$ begin
  create type namra_sync_status as enum ('PENDING', 'SUBMITTED', 'CLEARED', 'FAILED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type namra_tax_category as enum ('STANDARD', 'ZERO_RATED', 'EXEMPT');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- identity: merchant, branch, terminal
create table if not exists fiscal_taxpayer (
  ws          text not null,
  tin         text not null check (tin ~ '^[0-9A-Za-z-]{4,20}$'),
  vat_number  text,
  legal_name  text not null default '',
  created_at  timestamptz not null default now(),
  primary key (ws, tin)
);

create table if not exists fiscal_branch (
  ws           text not null,
  tin          text not null,
  branch_code  text not null check (branch_code ~ '^[0-9A-Za-z-]{1,16}$'),
  name         text not null default '',
  created_at   timestamptz not null default now(),
  primary key (ws, tin, branch_code),
  foreign key (ws, tin) references fiscal_taxpayer (ws, tin)
);

create table if not exists fiscal_terminal (
  ws           text not null,
  tin          text not null,
  branch_code  text not null,
  terminal_id  text not null check (terminal_id ~ '^[0-9A-Za-z-]{1,16}$'),
  label        text not null default '',
  last_seq     bigint not null default 0 check (last_seq >= 0),
  last_hash    text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (ws, tin, branch_code, terminal_id),
  foreign key (ws, tin, branch_code) references fiscal_branch (ws, tin, branch_code)
);

-- ---------------------------------------------------------------- the receipt
create table if not exists fiscal_invoice (
  ws                  text not null,
  id                  text not null,                         -- '<terminal>-<sequence, 10 digits>', same as the app's outbox key
  tin                 text not null,
  branch_code         text not null,
  terminal_id         text not null,
  sequence            bigint not null check (sequence > 0),  -- gap free per terminal
  invoice_number      text not null,
  idempotency_key     text not null,                         -- tin:branch:terminal:sequence
  doc_type            text not null default 'SALE' check (doc_type in ('SALE', 'CREDIT_NOTE', 'DEBIT_NOTE')),
  issued_at           timestamptz not null,
  local_offset        text not null default '+02:00',
  currency            char(3) not null default 'NAD',
  buyer_tin           text,
  buyer_name          text,
  payment_method      text,
  gross_cents         bigint not null,
  net_cents           bigint not null,
  vat_cents           bigint not null,
  previous_hash       text,
  payload_hash        text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload             jsonb not null,                        -- the exact bytes' source: what was hashed and sent

  sync_status         namra_sync_status not null default 'PENDING',
  attempts            integer not null default 0 check (attempts >= 0),
  next_attempt_at     timestamptz,
  last_error          text,

  namra_irn           text,                                  -- unique invoice reference number from the authority
  namra_qr_code_url   text,
  namra_signature     text,
  cleared_at          timestamptz,

  sale_id             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  primary key (ws, id),
  unique (ws, tin, branch_code, terminal_id, sequence),
  unique (ws, idempotency_key),
  foreign key (ws, tin, branch_code, terminal_id) references fiscal_terminal (ws, tin, branch_code, terminal_id),
  constraint fiscal_invoice_arith check (gross_cents = net_cents + vat_cents),
  constraint fiscal_invoice_cleared check (
    sync_status <> 'CLEARED' or (namra_irn is not null and namra_qr_code_url is not null and namra_signature is not null and cleared_at is not null)),
  constraint fiscal_invoice_qr_https check (namra_qr_code_url is null or namra_qr_code_url like 'https://%'),
  constraint fiscal_invoice_hash_chain check (previous_hash is null or previous_hash ~ '^[0-9a-f]{64}$')
);
create unique index if not exists fiscal_invoice_irn_uq on fiscal_invoice (ws, namra_irn) where namra_irn is not null;
create index if not exists fiscal_invoice_queue on fiscal_invoice (ws, sync_status, next_attempt_at) where sync_status in ('PENDING', 'SUBMITTED', 'FAILED');
create index if not exists fiscal_invoice_issued on fiscal_invoice (ws, issued_at);

-- ---------------------------------------------------------------- lines with the exact tax category
create table if not exists fiscal_invoice_line (
  ws                text not null,
  invoice_id        text not null,
  line_no           integer not null check (line_no > 0),
  product_id        text,
  description       text not null default '',
  quantity          numeric(14, 3) not null check (quantity <> 0),
  unit_gross_cents  bigint not null,
  gross_cents       bigint not null,
  net_cents         bigint not null,
  vat_cents         bigint not null,
  tax_category      namra_tax_category not null,
  rate_bp           integer,                                  -- 1500 = 15.00 %, 0 = zero rated, null = exempt
  primary key (ws, invoice_id, line_no),
  foreign key (ws, invoice_id) references fiscal_invoice (ws, id) on delete restrict,
  constraint fiscal_line_arith check (gross_cents = net_cents + vat_cents),
  constraint fiscal_line_category check (
    (tax_category = 'STANDARD'   and rate_bp is not null and rate_bp > 0)
 or (tax_category = 'ZERO_RATED' and rate_bp = 0 and vat_cents = 0)
 or (tax_category = 'EXEMPT'     and rate_bp is null and vat_cents = 0))
);

-- VAT by percentage pool, one row per category and rate on the receipt
create table if not exists fiscal_invoice_tax_pool (
  ws            text not null,
  invoice_id    text not null,
  tax_category  namra_tax_category not null,
  rate_bp       integer,
  net_cents     bigint not null,
  vat_cents     bigint not null,
  gross_cents   bigint not null,
  foreign key (ws, invoice_id) references fiscal_invoice (ws, id) on delete restrict,
  constraint fiscal_pool_arith check (gross_cents = net_cents + vat_cents)
);
create unique index if not exists fiscal_pool_uq on fiscal_invoice_tax_pool (ws, invoice_id, tax_category, coalesce(rate_bp, -1));

-- receipts the trigger could not accept, kept for the owner and for support
create table if not exists fiscal_anomaly (
  id          bigint generated always as identity primary key,
  ws          text not null,
  doc_id      text,
  reason      text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists fiscal_anomaly_ws on fiscal_anomaly (ws, created_at);

-- ---------------------------------------------------------------- guards
-- Fiscal records are never deleted, and the signed content never changes after the first write.
create or replace function fiscal_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'fiscal records cannot be deleted (%.%)', tg_table_name, old.ws using errcode = 'P0001';
  end if;
  if tg_table_name = 'fiscal_invoice' then
    if new.ws <> old.ws or new.id <> old.id or new.tin <> old.tin or new.branch_code <> old.branch_code or new.terminal_id <> old.terminal_id
       or new.sequence <> old.sequence or new.invoice_number <> old.invoice_number or new.idempotency_key <> old.idempotency_key
       or new.doc_type <> old.doc_type or new.issued_at <> old.issued_at
       or new.gross_cents <> old.gross_cents or new.net_cents <> old.net_cents or new.vat_cents <> old.vat_cents
       or new.previous_hash is distinct from old.previous_hash or new.payload_hash <> old.payload_hash or new.payload <> old.payload then
      raise exception 'fiscal invoice % is sealed: content cannot change', old.id using errcode = 'P0001';
    end if;
    if old.sync_status = 'CLEARED' and (new.sync_status <> 'CLEARED' or new.namra_irn is distinct from old.namra_irn
       or new.namra_qr_code_url is distinct from old.namra_qr_code_url or new.namra_signature is distinct from old.namra_signature) then
      raise exception 'fiscal invoice % is CLEARED: clearance cannot change', old.id using errcode = 'P0001';
    end if;
    new.updated_at := now();
  else
    raise exception '% rows are sealed once written', tg_table_name using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists fiscal_invoice_guard on fiscal_invoice;
create trigger fiscal_invoice_guard before update or delete on fiscal_invoice for each row execute function fiscal_guard();
drop trigger if exists fiscal_line_guard on fiscal_invoice_line;
create trigger fiscal_line_guard before update or delete on fiscal_invoice_line for each row execute function fiscal_guard();
drop trigger if exists fiscal_pool_guard on fiscal_invoice_tax_pool;
create trigger fiscal_pool_guard before update or delete on fiscal_invoice_tax_pool for each row execute function fiscal_guard();

-- ---------------------------------------------------------------- projection: pesa_docs -> fiscal_* tables
create or replace function fiscal_cents(t text) returns bigint language sql immutable as $$
  select round(t::numeric * 100)::bigint
$$;

create or replace function pesa_fiscal_project() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d jsonb := new.data; p jsonb; r jsonb; s jsonb; l jsonb; q jsonb;
  v_tin text; v_branch text; v_term text; v_status namra_sync_status; v_id text; v_exist fiscal_invoice;
begin
  if new.coll <> 'fiscalOutbox' or new.deleted or d is null or jsonb_typeof(d->'payload') <> 'object' then
    return new;                                              -- markers (BUILD errors) and tombstones are ignored here
  end if;
  begin
    p := d->'payload'; s := p->'seller'; v_id := d->>'id';
    v_tin := s->>'tin'; v_branch := s->>'branchCode'; v_term := s->>'terminalId';
    v_status := case when d->>'status' in ('PENDING', 'SUBMITTED', 'CLEARED', 'FAILED') then (d->>'status')::namra_sync_status else 'PENDING' end;

    insert into fiscal_taxpayer (ws, tin, vat_number, legal_name) values (new.ws, v_tin, s->>'vatNumber', coalesce(s->>'name', ''))
      on conflict (ws, tin) do update set vat_number = coalesce(excluded.vat_number, fiscal_taxpayer.vat_number), legal_name = case when excluded.legal_name <> '' then excluded.legal_name else fiscal_taxpayer.legal_name end;
    insert into fiscal_branch (ws, tin, branch_code) values (new.ws, v_tin, v_branch) on conflict do nothing;
    insert into fiscal_terminal (ws, tin, branch_code, terminal_id) values (new.ws, v_tin, v_branch, v_term) on conflict do nothing;

    select * into v_exist from fiscal_invoice where ws = new.ws and id = v_id;
    if not found then
      insert into fiscal_invoice (ws, id, tin, branch_code, terminal_id, sequence, invoice_number, idempotency_key, doc_type, issued_at, local_offset, currency,
        buyer_tin, buyer_name, payment_method, gross_cents, net_cents, vat_cents, previous_hash, payload_hash, payload,
        sync_status, attempts, next_attempt_at, last_error, namra_irn, namra_qr_code_url, namra_signature, cleared_at, sale_id)
      values (new.ws, v_id, v_tin, v_branch, v_term, (p->'invoice'->>'sequence')::bigint, p->'invoice'->>'number', p->'invoice'->>'idempotencyKey',
        coalesce(p->'invoice'->>'type', 'SALE'), (p->'invoice'->>'issuedAt')::timestamptz, coalesce(p->'invoice'->>'localOffset', '+02:00'), coalesce(p->'invoice'->>'currency', 'NAD'),
        p->'buyer'->>'tin', p->'buyer'->>'name', p->'payments'->0->>'method',
        fiscal_cents(p->'totals'->>'gross'), fiscal_cents(p->'totals'->>'net'), fiscal_cents(p->'totals'->>'vat'),
        p->'integrity'->>'previousHash', p->'integrity'->>'hash', p,
        v_status, coalesce((d->>'attempts')::int, 0), case when (d->>'nextAttemptAt')::bigint > 0 then to_timestamp((d->>'nextAttemptAt')::bigint / 1000.0) end, d->>'lastError',
        d->'clearance'->>'irn', d->'clearance'->>'qrUrl', d->'clearance'->>'signature', nullif(d->'clearance'->>'clearedAt', '')::timestamptz, d->>'saleId');
      for l in select * from jsonb_array_elements(p->'lines') loop
        insert into fiscal_invoice_line (ws, invoice_id, line_no, product_id, description, quantity, unit_gross_cents, gross_cents, net_cents, vat_cents, tax_category, rate_bp)
        values (new.ws, v_id, (l->>'n')::int, l->>'productId', coalesce(l->>'description', ''), (l->>'quantity')::numeric, fiscal_cents(l->>'unitGross'),
          fiscal_cents(l->>'gross'), fiscal_cents(l->>'net'), fiscal_cents(l->>'vat'), (l->>'taxCategory')::namra_tax_category,
          case when l->>'ratePct' is null then null else round((l->>'ratePct')::numeric * 100)::int end);
      end loop;
      for q in select * from jsonb_array_elements(p->'totals'->'pools') loop
        insert into fiscal_invoice_tax_pool (ws, invoice_id, tax_category, rate_bp, net_cents, vat_cents, gross_cents)
        values (new.ws, v_id, (q->>'taxCategory')::namra_tax_category, case when q->>'ratePct' is null then null else round((q->>'ratePct')::numeric * 100)::int end,
          fiscal_cents(q->>'net'), fiscal_cents(q->>'vat'), fiscal_cents(q->>'gross'));
      end loop;
      update fiscal_terminal set last_seq = greatest(last_seq, (p->'invoice'->>'sequence')::bigint),
        last_hash = case when (p->'invoice'->>'sequence')::bigint >= last_seq then p->'integrity'->>'hash' else last_hash end
        where ws = new.ws and tin = v_tin and branch_code = v_branch and terminal_id = v_term;
    else
      if v_exist.payload_hash <> p->'integrity'->>'hash' then
        insert into fiscal_anomaly (ws, doc_id, reason, detail) values (new.ws, v_id, 'PAYLOAD_CHANGED_AFTER_SEAL', jsonb_build_object('stored', v_exist.payload_hash, 'received', p->'integrity'->>'hash'));
        return new;
      end if;
      if v_exist.sync_status = 'CLEARED' then return new; end if;     -- clearance is final
      update fiscal_invoice set sync_status = v_status, attempts = coalesce((d->>'attempts')::int, attempts),
        next_attempt_at = case when (d->>'nextAttemptAt')::bigint > 0 then to_timestamp((d->>'nextAttemptAt')::bigint / 1000.0) end, last_error = d->>'lastError',
        namra_irn = d->'clearance'->>'irn', namra_qr_code_url = d->'clearance'->>'qrUrl', namra_signature = d->'clearance'->>'signature',
        cleared_at = nullif(d->'clearance'->>'clearedAt', '')::timestamptz
        where ws = new.ws and id = v_id;
    end if;
  exception when others then
    -- never fail the app's sync write: keep the record in pesa_docs and log why it was not projected
    insert into fiscal_anomaly (ws, doc_id, reason, detail) values (new.ws, new.id, 'PROJECTION_ERROR', jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm));
  end;
  return new;
end $$;

drop trigger if exists pesa_fiscal_project_trg on pesa_docs;
create trigger pesa_fiscal_project_trg after insert or update on pesa_docs for each row execute function pesa_fiscal_project();

-- ---------------------------------------------------------------- reports
-- gaps in the per-terminal sequence and broken links in the hash chain
create or replace function fiscal_chain_report(p_ws text)
returns table (terminal_id text, sequence bigint, problem text) language sql stable security invoker as $$
  with x as (
    select terminal_id, sequence, payload_hash, previous_hash,
           lag(sequence) over w as prev_seq, lag(payload_hash) over w as prev_hash
    from fiscal_invoice where ws = p_ws window w as (partition by tin, branch_code, terminal_id order by sequence))
  select terminal_id, sequence, case when prev_seq is null and sequence > 1 then 'MISSING_BEFORE_FIRST'
                                     when prev_seq is not null and sequence <> prev_seq + 1 then 'SEQUENCE_GAP'
                                     else 'HASH_LINK_BROKEN' end
  from x where (prev_seq is null and sequence > 1) or (prev_seq is not null and sequence <> prev_seq + 1)
            or (prev_seq is not null and sequence = prev_seq + 1 and previous_hash is distinct from prev_hash)
$$;

-- VAT by month, category and rate, with how much is already cleared
create or replace view fiscal_vat_summary with (security_invoker = true) as
select i.ws, date_trunc('month', i.issued_at at time zone '+02:00')::date as month,
       l.tax_category, l.rate_bp,
       sum(l.net_cents) as net_cents, sum(l.vat_cents) as vat_cents, sum(l.gross_cents) as gross_cents,
       sum(case when i.sync_status = 'CLEARED' then l.gross_cents else 0 end) as cleared_gross_cents,
       count(distinct i.id) as invoices
from fiscal_invoice i join fiscal_invoice_line l on l.ws = i.ws and l.invoice_id = i.id
group by 1, 2, 3, 4;

-- queue health for the owner screen
create or replace view fiscal_queue_status with (security_invoker = true) as
select ws, sync_status, count(*) as invoices, min(issued_at) as oldest, max(attempts) as max_attempts
from fiscal_invoice group by ws, sync_status;

-- ---------------------------------------------------------------- row level security (same rule as pesa_docs)
do $$
declare t text;
begin
  foreach t in array array['fiscal_taxpayer', 'fiscal_branch', 'fiscal_terminal', 'fiscal_invoice', 'fiscal_invoice_line', 'fiscal_invoice_tax_pool', 'fiscal_anomaly']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists pesa_read on %I', t);
    execute format($p$create policy pesa_read on %I for select to anon using (ws = coalesce(current_setting('request.headers', true)::json->>'x-pesa-code',''))$p$, t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to anon', t);
  end loop;
end $$;
grant select on fiscal_vat_summary, fiscal_queue_status to anon;
grant execute on function fiscal_chain_report(text) to anon;
revoke all on function pesa_fiscal_project() from public, anon, authenticated;

commit;
