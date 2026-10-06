// Quick checks that need no browser (Node version of check.py): page script parses, versions agree, provisioning SQL is current.
// Run from the project folder: node tests/check.js
process.chdir(require('path').join(__dirname,'..'));
const fs=require('fs'),path=require('path'),cp=require('child_process');
const s=fs.readFileSync('index.html','utf8');
const scripts=[...s.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const js=scripts.reduce((a,b)=>b.length>a.length?b:a);
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
console.log('sw cache',fs.readFileSync('sw.js','utf8').match(/var CACHE = '([^']+)'/)[1]);
console.log(ok?'CHECK OK':'CHECK FAILED'); process.exit(ok?0:1);
