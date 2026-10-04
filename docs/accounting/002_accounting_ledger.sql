-- Pesa accounting ledger (optional, for a shop that wants its journals in its own Supabase project).
-- Run once in the Supabase SQL editor AFTER the Pesa sync script (it uses the same x-pesa-code header rule).
-- The Pesa app itself does not need this table: its monthly accounting records sync through pesa_docs
-- (collection "accountingPeriods"). This table is for an accountant or a report tool that wants the
-- journals as rows. Safe to run more than once.

create table if not exists public.accounting_ledger_entries (
  id                 uuid primary key default gen_random_uuid(),
  ws                 text not null,                 -- Pesa workspace code: the same value the app sends in x-pesa-code
  business_id        uuid not null,
  journal_id         text not null,                 -- one journal = one sale, expense, payment and so on (SALE-<id>, EXP-<id>)
  line_no            smallint not null check (line_no > 0),
  invoice_reference  varchar(100),
  account_code_target varchar(10) not null,
  posting_type       varchar(10) not null check (posting_type in ('DEBIT', 'CREDIT')),
  transaction_value_nad numeric(12, 2) not null check (transaction_value_nad > 0),
  journal_description text,
  journal_date       date not null,                 -- the business date, Namibia time
  posted_at          timestamptz not null default now(),
  unique (ws, journal_id, line_no),
  constraint ledger_ws_len check (char_length(replace(ws, '-', '')) >= 16)
);

-- Fast scans for the sheets: by account, by month, and by journal.
create index if not exists idx_ledger_code_search on public.accounting_ledger_entries (account_code_target, business_id);
create index if not exists idx_ledger_period on public.accounting_ledger_entries (ws, journal_date);
create index if not exists idx_ledger_journal on public.accounting_ledger_entries (ws, journal_id);

-- Every journal must balance to the cent. Checked when the transaction commits, so all the lines of a journal can be
-- inserted together and a journal that does not balance is refused as a whole.
create or replace function public.ledger_check_balanced() returns trigger language plpgsql as $$
declare d numeric; c numeric;
begin
  select coalesce(sum(transaction_value_nad) filter (where posting_type = 'DEBIT'), 0),
         coalesce(sum(transaction_value_nad) filter (where posting_type = 'CREDIT'), 0)
    into d, c from public.accounting_ledger_entries where ws = new.ws and journal_id = new.journal_id;
  if d <> c then
    raise exception 'Journal % is unbalanced: debits % credits %', new.journal_id, d, c using errcode = '23514';
  end if;
  return null;
end $$;

drop trigger if exists ledger_balanced_trg on public.accounting_ledger_entries;
create constraint trigger ledger_balanced_trg after insert on public.accounting_ledger_entries
  deferrable initially deferred for each row execute function public.ledger_check_balanced();

-- Append only: posted lines are never changed or deleted. A mistake is fixed with a reversing journal.
create or replace function public.ledger_no_change() returns trigger language plpgsql as $$
begin raise exception 'Ledger entries cannot be changed or deleted. Post a reversing journal instead.' using errcode = '42501'; end $$;
drop trigger if exists ledger_no_update_trg on public.accounting_ledger_entries;
create trigger ledger_no_update_trg before update or delete on public.accounting_ledger_entries
  for each row execute function public.ledger_no_change();

-- Row level security: a shop can only see and add its own lines (the same rule pesa_docs uses).
alter table public.accounting_ledger_entries enable row level security;
drop policy if exists ledger_read on public.accounting_ledger_entries;
create policy ledger_read on public.accounting_ledger_entries for select to anon
  using (ws = coalesce(current_setting('request.headers', true)::json->>'x-pesa-code', ''));
drop policy if exists ledger_add on public.accounting_ledger_entries;
create policy ledger_add on public.accounting_ledger_entries for insert to anon
  with check (ws = coalesce(current_setting('request.headers', true)::json->>'x-pesa-code', ''));
revoke all on public.accounting_ledger_entries from anon, authenticated;
grant select, insert on public.accounting_ledger_entries to anon;

-- Trial balance by account for one shop (debits, credits and net). Run with security_invoker so the policy above applies.
create or replace view public.accounting_trial_balance with (security_invoker = true) as
  select ws, account_code_target,
         sum(transaction_value_nad) filter (where posting_type = 'DEBIT')  as debits,
         sum(transaction_value_nad) filter (where posting_type = 'CREDIT') as credits,
         coalesce(sum(transaction_value_nad) filter (where posting_type = 'DEBIT'), 0)
       - coalesce(sum(transaction_value_nad) filter (where posting_type = 'CREDIT'), 0) as net_debit
    from public.accounting_ledger_entries group by ws, account_code_target;
grant select on public.accounting_trial_balance to anon;
