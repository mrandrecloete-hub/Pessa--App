-- Run by tests/db/run.sh against a throwaway Postgres. Each assertion raises on failure.
\set ON_ERROR_STOP on
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
set role authenticated;
insert into public.financial_accounts(id,user_id,name,currency_code) values ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','A main','NAD');
insert into public.transactions(user_id,account_id,transaction_type,amount,currency_code,base_currency_code,exchange_rate,base_amount,transaction_date,external_transaction_id,source)
 values ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','income',15000,'NAD','NAD',1,15000,'2026-11-01','fp1','import'),
        ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','expense',2500,'NAD','NAD',1,2500,'2026-11-02',null,'manual');
insert into public.transactions(user_id,account_id,transaction_type,amount,currency_code,base_currency_code,exchange_rate,base_amount,transaction_date,status)
 values ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','expense',300,'NAD','NAD',1,300,'2026-11-03','pending');

-- 1. balance counts settled only: 15000 - 2500, pending 300 ignored
do $$ begin
  if (select balance from public.account_balances) <> 12500 then raise exception 'balance wrong: %', (select balance from public.account_balances); end if;
end $$;

-- 2. same import fingerprint twice is rejected
do $$ begin
  begin
    insert into public.transactions(user_id,account_id,transaction_type,amount,currency_code,base_currency_code,exchange_rate,base_amount,transaction_date,external_transaction_id,source)
    values ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','income',15000,'NAD','NAD',1,15000,'2026-11-01','fp1','import');
    raise exception 'duplicate import was accepted';
  exception when unique_violation then null; end;
end $$;

-- 3. user B sees nothing of A
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
do $$ begin
  if (select count(*) from public.transactions) <> 0 then raise exception 'B can read A transactions'; end if;
  if (select count(*) from public.financial_accounts) <> 0 then raise exception 'B can read A accounts'; end if;
  if (select count(*) from public.account_balances) <> 0 then raise exception 'B can read A balances'; end if;
end $$;

-- 4. B cannot write into A's account or impersonate A
do $$ begin
  begin
    insert into public.transactions(user_id,account_id,transaction_type,amount,currency_code,base_currency_code,exchange_rate,base_amount,transaction_date)
    values ('00000000-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001','expense',1,'NAD','NAD',1,1,'2026-11-04');
    raise exception 'B wrote into A account';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.transactions(user_id,account_id,transaction_type,amount,currency_code,base_currency_code,exchange_rate,base_amount,transaction_date)
    values ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','expense',1,'NAD','NAD',1,1,'2026-11-04');
    raise exception 'B impersonated A';
  exception when insufficient_privilege then null; end;
  update public.transactions set amount = 1;
  if (select count(*) from public.transactions) <> 0 then raise exception 'unexpected rows'; end if;
end $$;
reset role;
do $$ begin
  if (select sum(amount) from public.transactions where user_id='00000000-0000-0000-0000-00000000000a') <> 17800 then raise exception 'B modified A data'; end if;
  if (select count(*) from public.profiles) <> 2 then raise exception 'profile trigger missing'; end if;
end $$;

-- 5. a foreign currency row must carry a real rate; same currency must be rate 1
do $$ begin
  begin
    insert into public.transactions(user_id,account_id,transaction_type,amount,currency_code,base_currency_code,exchange_rate,base_amount,transaction_date)
    values ('00000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','expense',5,'NAD','NAD',2,10,'2026-11-04');
    raise exception 'bad same-currency rate accepted';
  exception when check_violation then null; end;
end $$;
select 'RLS and constraint tests passed' as result;
