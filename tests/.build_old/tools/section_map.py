#!/usr/bin/env python3
"""Prints a map of the big single file: section name and line number. Paste the output into docs/ARCHITECTURE.md when sections move."""
import re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(root, 'app.js'), encoding='utf-8').read()
for m in re.finditer(r'/\* =+ ([^=\n]+?) =+', s):
    print('%6d  %s' % (s.count('\n', 0, m.start()) + 1, m.group(1).strip()))
