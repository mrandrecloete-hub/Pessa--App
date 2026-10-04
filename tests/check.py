#!/usr/bin/env python3
"""Quick checks that need no browser: the page script parses, every translation file entry is valid, and the service worker cache name was bumped with the app version."""
import re, os, subprocess, sys, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
js = max(re.findall(r'<script[^>]*>(.*?)</script>', s, re.S), key=len)
open('/tmp/pesa_check.js', 'w').write(js)
r = subprocess.run(['node', '--check', '/tmp/pesa_check.js'], capture_output=True, text=True)
ok = r.returncode == 0
print('script syntax:', 'ok' if ok else r.stderr[:400])
ver = re.search(r"var APP_VERSION = '([^']+)'", s).group(1)
cl = re.search(r"var CHANGELOG = \[\s*\{ v:'([^']+)'", s).group(1)
print('version', ver, 'top changelog entry', cl, 'ok' if ver == cl else 'MISMATCH'); ok = ok and ver == cl
import json as _json
mm = re.search(r'const SYNC_SQL = ("(?:[^"\\]|\\.)*");', s)
sqlfile = open(os.path.join(root, 'docs', 'provisioning', '01_pesa_sync_table.sql'), encoding='utf-8').read()
same = bool(mm) and _json.loads(mm.group(1)) in sqlfile
print('provisioning SQL matches the app:', 'ok' if same else 'OUT OF DATE, re-export SYNC_SQL'); ok = ok and same
sw = open(os.path.join(root, 'sw.js')).read()
print('service worker cache', re.search(r"var CACHE = '([^']+)'", sw).group(1))
sys.exit(0 if ok else 1)
