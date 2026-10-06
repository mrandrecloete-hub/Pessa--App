#!/usr/bin/env python3
"""Builds the sales site from tools/site_src.html.
  python3 tools/build_site.py            -> writes site/index.html
  python3 tools/build_site.py artifact OUT.html -> writes the fragment used for the Claude artifact (absolute links)
Edit prices and text in tools/site_src.html, then run this and tools/build_legal.py."""
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'tools', 'site_src.html'), encoding='utf-8').read()
BASE = 'https://mrandrecloete-hub.github.io/Pessa--App/'
if len(sys.argv) > 2 and sys.argv[1] == 'artifact':
    out = src.replace('{{SITE}}', BASE + 'site/').replace('{{APP}}', BASE)
    open(sys.argv[2], 'w', encoding='utf-8').write(out)
    print('wrote', sys.argv[2])
else:
    head, body = src.split('<!--BODY-->')
    head = head.replace('{{SITE}}', './').replace('{{APP}}', '../')
    body = body.replace('{{SITE}}', './').replace('{{APP}}', '../')
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            '<meta name="description" content="Pesa is the shop and till app made in Namibia. Sell, keep stock, record credit, print invoices and see your VAT. 14 days free.">\n'
            '<meta name="theme-color" content="#082E22">\n<link rel="icon" href="img/pesa-icon.png">\n'
            + head + '\n</head>\n<body>' + body + '\n</body>\n</html>\n')
    open(os.path.join(root, 'site', 'index.html'), 'w', encoding='utf-8').write(page)
    print('wrote site/index.html')
