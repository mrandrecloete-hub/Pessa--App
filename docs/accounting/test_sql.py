"""Validates 002_accounting_ledger.sql on a throwaway local Postgres.   pip install pgserver psycopg2-binary ; python3 docs/accounting/test_sql.py"""
import os, tempfile, uuid, pgserver, psycopg2, json
HERE = os.path.dirname(os.path.abspath(__file__))
db = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode='delete')
con = psycopg2.connect(db.get_uri()); con.autocommit = True; cur = con.cursor()
cur.execute("create role anon nologin; create role authenticated nologin;")
mig = open(os.path.join(HERE, '002_accounting_ledger.sql')).read()
cur.execute(mig); cur.execute(mig); print('migration runs twice: ok')
cur.execute("grant usage on schema public to anon")
WS, OTHER, BIZ = 'aaaa-bbbb-cccc-dddd-eeee', 'zzzz-yyyy-xxxx-wwww-vvvv', str(uuid.uuid4())
bad = 0
def check(n, c):
    global bad; print(('  ok   ' if c else '  FAIL ') + n); bad += 0 if c else 1
def anon(ws=WS):
    cur.execute("reset role"); cur.execute("set role anon"); cur.execute("select set_config('request.headers', %s, false)", (json.dumps({'x-pesa-code': ws}),))
def owner(): cur.execute("reset role")
def ins(j, n, acct, typ, v, ws=WS):
    cur.execute("insert into accounting_ledger_entries (ws,business_id,journal_id,line_no,account_code_target,posting_type,transaction_value_nad,journal_date) values (%s,%s,%s,%s,%s,%s,%s,current_date)", (ws, BIZ, j, n, acct, typ, v))
def fails(fn):
    cur.execute("reset role") if False else None
    try: fn(); return False
    except Exception as e: return True
anon()
cur.execute("begin")
ins('SALE-1',1,'1000','DEBIT',115.00); ins('SALE-1',2,'4000','CREDIT',100.00); ins('SALE-1',3,'2150','CREDIT',15.00)
cur.execute("commit"); check('balanced journal accepted', True)
cur.execute("begin"); ins('SALE-2',1,'1000','DEBIT',50.00); ins('SALE-2',2,'4000','CREDIT',49.99)
try: cur.execute("commit"); check('unbalanced journal refused', False)
except Exception as e: check('unbalanced journal refused', 'unbalanced' in str(e)); cur.execute("rollback")
anon()
check('zero amount refused', fails(lambda: ins('X',1,'1000','DEBIT',0)))
check('bad posting type refused', fails(lambda: ins('X',1,'1000','DEBT',5)))
check('duplicate line refused', fails(lambda: ins('SALE-1',1,'1000','DEBIT',5)))
cur.execute("select count(*) from accounting_ledger_entries"); check('anon sees own lines (3)', cur.fetchone()[0] == 3)
check('update refused', fails(lambda: cur.execute("update accounting_ledger_entries set transaction_value_nad = 1")))
check('delete refused', fails(lambda: cur.execute("delete from accounting_ledger_entries")))
check('cannot add lines for another shop', fails(lambda: ins('SALE-9',1,'1000','DEBIT',5, OTHER)))
anon(OTHER); cur.execute("select count(*) from accounting_ledger_entries"); check('other shop sees nothing', cur.fetchone()[0] == 0)
anon(); cur.execute("select account_code_target, net_debit from accounting_trial_balance order by 1"); rows = cur.fetchall()
check('trial balance view nets to zero', sum(float(r[1]) for r in rows) == 0)
print('FAILED' if bad else 'ALL OK'); raise SystemExit(1 if bad else 0)
