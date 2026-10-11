#!/usr/bin/env python3
"""Scores a Blaze model against eval.jsonl (held out questions made by make_dataset.py, never used for training).
Start the model first:  llama-server -m blaze-q8.gguf --jinja --port 8080 -c 6144
Then:                   python3 eval.py http://127.0.0.1:8080/v1 [--key KEY] [--model blaze]
It sends each question with the same system prompt and tools the app uses, and checks the FIRST reply:
  tool name correct, arguments valid (same rules as the server), and for non tool questions that it did not call a tool.
Prints a percentage per tool and the questions it got wrong, so you can add examples for them (teach_more.example.jsonl)."""
import argparse, json, os, sys, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); SYSTEM = 'You are Blaze, a helpful, friendly assistant built by Björn. Use the provided tools when they help.'

def check_args(tool, args):
    props, req = tool['parameters']['properties'], tool['parameters']['required']
    if not isinstance(args, dict): return 'bad_input'
    for k in req:
        if not isinstance(args.get(k), str) or not args[k].strip(): return 'missing_' + k
    for k, v in args.items():
        p = props.get(k)
        if not p: return 'unexpected_' + k
        if not isinstance(v, str): return 'bad_' + k
        if 'enum' in p and v not in p['enum']: return 'bad_' + k
    return ''

def call(base, key, model, question, tools):
    body = {'model': model, 'temperature': 0, 'max_tokens': 300, 'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': question}],
            'tools': [{'type': 'function', 'function': t} for t in tools]}
    req = urllib.request.Request(base.rstrip('/') + '/chat/completions', json.dumps(body).encode(), {'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + key} if key else {})})
    return json.load(urllib.request.urlopen(req, timeout=120))['choices'][0]['message']

def score(reply, item, tools):
    """returns (ok, why)"""
    calls = reply.get('tool_calls') or []
    if item['tool'] is None: return (not calls, 'called a tool for a chat question' if calls else '')
    if not calls: return (False, 'no tool call')
    f = calls[0]['function']; name = f['name']
    try: args = json.loads(f.get('arguments') or '{}')
    except Exception: return (False, 'arguments are not JSON')
    if name != item['tool']: return (False, 'wrong tool ' + name)
    t = next((x for x in tools if x['name'] == name), None)
    bad = check_args(t, args) if t else 'unknown_tool'
    if bad: return (False, 'invalid arguments: ' + bad)
    if args != item['args']: return (False, 'different arguments %s (expected %s)' % (json.dumps(args), json.dumps(item['args'])))
    return (True, '')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('base'); ap.add_argument('--key'); ap.add_argument('--model', default='blaze'); ap.add_argument('--file', default=os.path.join(HERE, 'eval.jsonl'))
    a = ap.parse_args(); tools = json.load(open(os.path.join(HERE, 'tools.json'), encoding='utf-8'))
    items = [json.loads(l) for l in open(a.file, encoding='utf-8') if l.strip()]
    per, bad = {}, []
    for it in items:
        try: ok, why = score(call(a.base, a.key, a.model, it['q'], tools), it, tools)
        except Exception as e: ok, why = False, 'request failed: %s' % e
        k = it['tool'] or '(chat)'; p = per.setdefault(k, [0, 0]); p[1] += 1; p[0] += ok
        if not ok: bad.append((k, it['q'], why))
    tot = sum(p[0] for p in per.values()); n = sum(p[1] for p in per.values())
    for k in sorted(per, key=lambda k: per[k][0] / per[k][1]): print('%5.0f%%  %s (%d of %d)' % (per[k][0] / per[k][1] * 100, k, per[k][0], per[k][1]))
    print('\nOVERALL %.1f%% (%d of %d)' % (tot / n * 100, tot, n))
    if bad: print('\nWRONG:'); [print(' [%s] %s -> %s' % b) for b in bad[:60]]
    sys.exit(0 if tot / n >= 0.9 else 1)
if __name__ == '__main__': main()
