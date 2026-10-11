// Single source of truth for Blaze's tools: supabase/functions/_shared/aihandler.mjs (the server whitelist).
// This script writes tools/blaze_training/tools.json (for training) and the BLAZE_TOOLS list inside tools/blaze.js (for the app),
// so training and the app can never drift apart. tests/check.js runs it with --check.
// Usage: node tools/blaze_training/sync_tools.mjs [--check]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TOOLS } from '../../supabase/functions/_shared/aihandler.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), check = process.argv.includes('--check');
const list = Object.keys(TOOLS).filter(n => TOOLS[n].where === 'phone').map(n => {
  const t = TOOLS[n], props = {};
  Object.keys(t.p).forEach(k => { const x = t.p[k]; props[k] = x.enum ? { type:'string', enum:x.enum } : { type:'string', maxLength:x.max }; });
  return { name:n, description:t.d, parameters:{ type:'object', properties:props, required:t.req } };
});
const json = JSON.stringify(list, null, 2) + '\n';
const bp = path.join(here, '..', 'blaze.js'); let src = fs.readFileSync(bp, 'utf8');
const block = '/*TOOLS:START*/\nvar BLAZE_TOOLS = ' + JSON.stringify(list) + ';\n/*TOOLS:END*/';
const next = src.replace(/\/\*TOOLS:START\*\/[\s\S]*?\/\*TOOLS:END\*\//, () => block);
const tp = path.join(here, 'tools.json'); const cur = fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '';
if(check){
  if(cur !== json || next !== src){ console.error('Blaze tools are out of sync. Run: node tools/blaze_training/sync_tools.mjs'); process.exit(1); }
  console.log('blaze tools in sync (' + list.length + ')');
} else { fs.writeFileSync(tp, json); fs.writeFileSync(bp, next); console.log('wrote tools.json and tools/blaze.js with', list.length, 'tools'); }
