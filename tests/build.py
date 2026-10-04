#!/usr/bin/env python3
"""Builds tests/.build/index.html: the real app with a test hook that exposes every top level function and
variable as window.__t, so the specs can call internals. The shipped index.html is never changed."""
import re, os, shutil
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'tests', '.build')
os.makedirs(os.path.join(out, 'fonts'), exist_ok=True)
for f in os.listdir(os.path.join(root, 'fonts')):
    if f.endswith('.ttf'): shutil.copy(os.path.join(root, 'fonts', f), os.path.join(out, 'fonts', f))
s = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
end = s.rindex('})();\n</script>')
body = s[:end]
names = set(re.findall(r'^function (\w+)\(', body, re.M)) | set(re.findall(r'^(?:var|const|let) (\w+)\b', body, re.M)) | set(re.findall(r'^async function (\w+)\(', body, re.M))
names.discard('window')
items = ','.join("%s:(typeof %s!=='undefined'?%s:undefined)" % (n, n, n) for n in sorted(names))
extras = ("setLic:function(o){ if(o.pub!==undefined) LIC_PUBLIC_KEY=o.pub; if(o.enforce!==undefined) LIC_ENFORCE_FROM=o.enforce; _licInfo=null; _licNotified=false; },"
          "trainState:function(){return _trainState;},"
          "ABOUT:{P:ABOUT_PARAGRAPHS,F:ABOUT_FEATURES,I:ABOUT_INTERNET,C:ABOUT_CONNECTION,S:ABOUT_SMART,CT:ABOUT_CONNECTION_TITLE,ST:ABOUT_SMART_TITLE,FT:ABOUT_FEATURES_TITLE},"
          "PRIV:{I:PRIVACY_INTRO,S:PRIVACY_SECTIONS}")
s = s[:end] + "window.__t={" + items + "," + extras + "};\n" + s[end:]
s = s.replace('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf.umd.min.js')
# the PDF engine is installed from npm so the tests never need the internet
for cand in [os.path.join(root, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js')]:
    if os.path.exists(cand): shutil.copy(cand, os.path.join(out, 'jspdf.umd.min.js'))
for d in ('voice', 'tools'):
    src = os.path.join(root, d)
    if os.path.isdir(src): shutil.copytree(src, os.path.join(out, d), dirs_exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(s)
print('built', len(names), 'hooks')
