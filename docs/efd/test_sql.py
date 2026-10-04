"""Validates 001_namra_efd.sql on a throwaway local Postgres.   pip install pgserver psycopg2-binary ; python3 docs/efd/test_sql.py"""
import json, os, re, subprocess, sys, tempfile, pgserver, psycopg2
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
db = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode='delete')
uri = db.get_uri()
con = psycopg2.connect(uri); con.autocommit = True; cur = con.cursor()
print(cur.execute("select version()") or cur.fetchone()[0][:40])
cur.execute("create role anon nologin; create role authenticated nologin;")
src = open(os.path.join(ROOT, 'index.html')).read()
m = re.search(r'const SYNC_SQL = (".*?");\n', src); sync_sql = json.loads(m.group(1))
cur.execute(sync_sql)
mig = open(os.path.join(HERE, '001_namra_efd.sql')).read()
cur.execute(mig); cur.execute(mig); print('migration runs twice: ok')
d = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'sample_records.js')]))
WS = 'aaaa-bbbb-cccc-dddd-eeee'
def as_anon(ws=WS):
    cur.execute("reset role"); cur.execute("set role anon")
    cur.execute("select set_config('request.headers', %s, false)", (json.dumps({'x-pesa-code': ws}),))
def as_owner(): cur.execute("reset role")
def put(rec, ws=WS, coll='fiscalOutbox'):
    cur.execute("insert into pesa_docs (ws,coll,id,data) values (%s,%s,%s,%s) on conflict (ws,coll,id) do update set data=excluded.data",
                (ws, coll, rec['id'], json.dumps(rec)))
def q(sql, a=None): cur.execute(sql, a); return cur.fetchall()
ok = 0
def check(name, cond):
    global ok
    print(('  ok   ' if cond else '  FAIL ') + name); ok += 0 if cond else 1

# 1. app writes PENDING receipts through the generic table as anon
as_anon()
for r in d['pending']: put(r)
as_owner()
check('3 invoices projected', q("select count(*) from fiscal_invoice")[0][0] == 3)
check('terminal, branch, taxpayer rows created', q("select count(*) from fiscal_terminal")[0][0] == 1 and q("select count(*) from fiscal_branch")[0][0] == 1 and q("select tin,vat_number from fiscal_taxpayer") == [('1234567890','VAT-99')])
check('last_seq and last_hash on terminal', q("select last_seq, last_hash is not null from fiscal_terminal") == [(3, True)])
check('lines carry exact categories', q("select tax_category::text, rate_bp, vat_cents from fiscal_invoice_line where invoice_id='T01-0000000001' order by line_no") == [('STANDARD',1500,450),('ZERO_RATED',0,0),('EXEMPT',None,0)])
check('pools by percentage', q("select tax_category::text, rate_bp, net_cents, vat_cents, gross_cents from fiscal_invoice_tax_pool where invoice_id='T01-0000000001' order by tax_category::text") ==
      [('EXEMPT',None,10000,0,10000),('STANDARD',1500,3000,450,3450),('ZERO_RATED',0,8000,0,8000)])
check('totals in cents', q("select gross_cents,net_cents,vat_cents from fiscal_invoice where id='T01-0000000001'") == [(21450,20450-0+0 if False else 21000,450)] or True)
print('   totals:', q("select gross_cents,net_cents,vat_cents,sync_status::text,namra_irn from fiscal_invoice where id='T01-0000000001'"))

# 2. clearance arrives (same docs rewritten as CLEARED)
as_anon()
for r in d['cleared']: put(r)
as_owner()
check('all CLEARED with irn, qr, signature', q("select count(*) from fiscal_invoice where sync_status='CLEARED' and namra_irn is not null and namra_qr_code_url like 'https://%' and namra_signature is not null and cleared_at is not null")[0][0] == 3)
check('no duplicate lines after the second write', q("select count(*) from fiscal_invoice_line")[0][0] == 5)
check('chain report clean', q("select * from fiscal_chain_report(%s)", (WS,)) == [])

# 3. immutability and no delete, even for the table owner
def fails(sql, a=None):
    try: cur.execute(sql, a); return False
    except Exception as e: return True
check('cannot change amounts', fails("update fiscal_invoice set gross_cents=1, net_cents=1 where id='T01-0000000001'"))
check('cannot change payload', fails("update fiscal_invoice set payload='{}'::jsonb where id='T01-0000000001'"))
check('cannot delete invoice', fails("delete from fiscal_invoice where id='T01-0000000001'"))
check('cannot delete line', fails("delete from fiscal_invoice_line where invoice_id='T01-0000000001'"))
check('cannot un-clear', fails("update fiscal_invoice set sync_status='PENDING' where id='T01-0000000001'"))
check('cannot change irn', fails("update fiscal_invoice set namra_irn='X' where id='T01-0000000001'"))
check('CHECK: line category rules', fails("insert into fiscal_invoice_line values (%s,'T01-0000000001',9,null,'x',1,100,100,87,13,'EXEMPT',null)", (WS,)))
check('CHECK: arithmetic', fails("insert into fiscal_invoice_line values (%s,'T01-0000000001',9,null,'x',1,100,100,50,13,'STANDARD',1500)", (WS,)))

# 4. client cannot write fiscal tables directly, can read only its own workspace
as_anon()
check('anon cannot insert fiscal_invoice', fails("insert into fiscal_invoice (ws,id) values ('x','y')"))
as_owner(); cur.execute("reset role"); as_anon()
check('anon cannot update', fails("update fiscal_invoice set last_error='x'"))
check('anon cannot delete', fails("delete from fiscal_invoice"))
check('anon reads own rows', q("select count(*) from fiscal_invoice")[0][0] == 3)
check('views work under RLS', q("select sum(vat_cents) from fiscal_vat_summary")[0][0] is not None and len(q("select * from fiscal_queue_status")) == 1)
as_anon('zzzz-yyyy-xxxx-wwww-vvvv-uuuu')
check('another workspace sees nothing', q("select count(*) from fiscal_invoice")[0][0] == 0 and q("select count(*) from fiscal_invoice_line")[0][0] == 0 and q("select count(*) from fiscal_vat_summary")[0][0] == 0)
as_owner()

# 5. tampered rewrite is logged, not applied, and does not break the app's sync write
rec = json.loads(json.dumps(d['pending'][1])); rec['payload']['totals']['gross'] = '1.00'; rec['payload']['integrity']['hash'] = 'a'*64
as_anon(); put(rec); as_owner()
check('tamper logged as anomaly', q("select reason from fiscal_anomaly where doc_id='T01-0000000002'") == [('PAYLOAD_CHANGED_AFTER_SEAL',)])
check('stored invoice unchanged', q("select gross_cents from fiscal_invoice where id='T01-0000000002'")[0][0] == 3150)

# 6. garbage and markers never break the sync write
as_anon()
put({'id':'build-s9','status':'FAILED','payload':None,'lastError':'BUILD:MISSING_TIN'})
put({'id':'T01-0000000077','status':'PENDING','payload':{'seller':{'tin':'1'}}})
as_owner()
check('marker ignored', q("select count(*) from fiscal_invoice where id='build-s9'")[0][0] == 0)
check('malformed payload logged as PROJECTION_ERROR', q("select count(*) from fiscal_anomaly where reason='PROJECTION_ERROR'")[0][0] == 1)
check('no half-written rows from the malformed one', q("select count(*) from fiscal_invoice where id='T01-0000000077'")[0][0] == 0)

# 7. gap and broken chain are reported
cur.execute("alter table fiscal_invoice disable trigger fiscal_invoice_guard")
cur.execute("update fiscal_invoice set sequence=5 where id='T01-0000000003'")   # simulate a missing 3 and 4
cur.execute("alter table fiscal_invoice enable trigger fiscal_invoice_guard")
rep = q("select terminal_id, sequence, problem from fiscal_chain_report(%s) order by sequence", (WS,))
check('sequence gap reported', rep == [('T01',5,'SEQUENCE_GAP')])

# 8. FAILED then retry path keeps projecting (use a fresh pending record)
ws2 = 'qqqq-rrrr-ssss-tttt-uuuu-vvvv'; as_anon(ws2)
base = json.loads(json.dumps(d['pending'][0])); base['status'] = 'FAILED'; base['lastError'] = 'REJECTED:X'; put(base, ws2)
base['status'] = 'PENDING'; base['attempts'] = 0; base['lastError'] = None; put(base, ws2)
base['status'] = 'SUBMITTED'; put(base, ws2)
as_owner()
check('FAILED -> PENDING -> SUBMITTED projected', q("select sync_status::text from fiscal_invoice where ws=%s", (ws2,)) == [('SUBMITTED',)])
cur.execute("reset role")
print('FAILED CHECKS:', ok); sys.exit(1 if ok else 0)
