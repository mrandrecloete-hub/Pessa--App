// Quick checks that need no browser (Node version of check.py): page script parses, versions agree, provisioning SQL is current.
// Run from the project folder: node tests/check.js
process.chdir(require('path').join(__dirname,'..'));
const fs=require('fs'),path=require('path'),cp=require('child_process');
const html=fs.readFileSync('index.html','utf8');
const s=fs.readFileSync('app.js','utf8');
const js=s;
const tmp=path.join(require('os').tmpdir(),'pesa_check.js');
fs.writeFileSync(tmp,js);
const r=cp.spawnSync('node',['--check',tmp],{encoding:'utf8'});
console.log('script syntax:',r.status===0?'ok':r.stderr.slice(0,400));
let ok=r.status===0;
const ver=s.match(/var APP_VERSION = '([^']+)'/)[1], cl=s.match(/var CHANGELOG = \[\s*\{ v:'([^']+)'/)[1];
console.log('version',ver,'changelog',cl,ver===cl?'ok':'MISMATCH');ok=ok&&ver===cl;
const mm=s.match(/const SYNC_SQL = ("(?:[^"\\]|\\.)*");/);
const sql=fs.readFileSync('docs/provisioning/01_pesa_sync_table.sql','utf8');
const same=!!mm&&sql.includes(JSON.parse(mm[1]));console.log('provisioning SQL matches:',same?'ok':'OUT OF DATE');ok=ok&&same;
const vj=JSON.parse(fs.readFileSync('version.json','utf8')).version;console.log('version.json',vj,vj===ver?'ok':'MISMATCH');ok=ok&&vj===ver;
const hv=(html.match(/<script src="app\.js\?v=([^"]+)">/)||[])[1],swt=fs.readFileSync('sw.js','utf8'),sv=(swt.match(/var APPJS = '\.\/app\.js\?v=([^']+)'/)||[])[1];
console.log('index.html app.js version',hv,hv===ver?'ok':'MISMATCH','sw APPJS',sv,sv===ver?'ok':'MISMATCH');ok=ok&&hv===ver&&sv===ver;
// Blaze: its tool list must match the server whitelist, and the copy inside app.js must match tools/blaze.js
{ const t=cp.spawnSync('node',['tools/blaze_training/sync_tools.mjs','--check'],{encoding:'utf8'}); const okT=t.status===0; console.log('blaze tools:',okT?'in sync':'OUT OF SYNC '+(t.stderr||'').slice(0,200)); ok=ok&&okT;
  const m=s.match(/\/\*BLAZE:START[^\n]*\n([\s\S]*?)\n\/\*BLAZE:END\*\//), src=fs.readFileSync('tools/blaze.js','utf8').trimEnd(); const okE=!!m&&m[1].trimEnd()===src; console.log('blaze block in app.js:',okE?'ok':'OUT OF DATE (run python3 tools/embed_block.py BLAZE blaze.js)'); ok=ok&&okE;
  for(const f of ['vendor/wllama/index.min.js','vendor/wllama/wllama.wasm','tools/blaze_training/tools.json']){ const ex=fs.existsSync(f); console.log(f+':',ex?'ok':'MISSING'); ok=ok&&ex; } }
console.log('sw cache',fs.readFileSync('sw.js','utf8').match(/var CACHE = '([^']+)'/)[1]);
console.log(ok?'CHECK OK':'CHECK FAILED'); process.exit(ok?0:1);
