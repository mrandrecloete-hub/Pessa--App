// Node version of build.py: builds tests/.build (the app plus a test hook) and tests/.build_old (a copy whose main script cannot be read, for the old browser guard test)
process.chdir(require("path").join(__dirname,".."));
const fs=require('fs'),path=require('path');
const root=process.cwd(),out=path.join(root,'tests','.build');
fs.mkdirSync(path.join(out,'fonts'),{recursive:true});
for(const f of fs.readdirSync('fonts'))if(f.endsWith('.ttf')||f.endsWith('.woff2'))fs.copyFileSync(path.join('fonts',f),path.join(out,'fonts',f));
let s=fs.readFileSync('index.html','utf8');
// the app code lives in app.js; the test build puts it back inline so the test hooks can be added
s=s.replace(/<script src="app\.js[^"]*"><\/script>/,()=>'<script>'+fs.readFileSync('app.js','utf8')+'</script>');
// test build only: the developer gate is open unless a spec sets window.__forceSimple (the production file keeps DEV_TEST_BYPASS = false)
s=s.replace('DEV_TEST_BYPASS = false','DEV_TEST_BYPASS = true');
const end=s.lastIndexOf('})();\n</script>');
const body=s.slice(0,end);
const names=new Set();
for(const re of [/^function (\w+)\(/gm,/^(?:var|const|let) (\w+)\b/gm,/^async function (\w+)\(/gm])for(const m of body.matchAll(re))names.add(m[1]);
names.delete('window');
const items=[...names].sort().map(n=>`${n}:(typeof ${n}!=='undefined'?${n}:undefined)`).join(',');
const extras="setDev:function(o){ if(o.salt!==undefined) DEV_SALT=o.salt; if(o.hash!==undefined) DEV_HASH=o.hash; if(o.server!==undefined) DEV_SERVER=o.server; if(o.pub!==undefined) DEV_PUBLIC_JWK=o.pub; },"+"setLic:function(o){ if(o.pub!==undefined) LIC_PUBLIC_KEY=o.pub; if(o.enforce!==undefined) LIC_ENFORCE_FROM=o.enforce; if(o.server!==undefined) LIC_SERVER=o.server; _licInfo=null; _licNotified=false; },"+
"trainState:function(){return _trainState;},"+
"ABOUT:{P:ABOUT_PARAGRAPHS,F:ABOUT_FEATURES,I:ABOUT_INTERNET,C:ABOUT_CONNECTION,S:ABOUT_SMART,CT:ABOUT_CONNECTION_TITLE,ST:ABOUT_SMART_TITLE,FT:ABOUT_FEATURES_TITLE},"+
"PRIV:{I:PRIVACY_INTRO,S:PRIVACY_SECTIONS}";
s=s.slice(0,end)+"window.__t={"+items+","+extras+"};\n"+s.slice(end);
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','jspdf.umd.min.js');
const c=path.join(root,'node_modules','jspdf','dist','jspdf.umd.min.js');
if(fs.existsSync(c))fs.copyFileSync(c,path.join(out,'jspdf.umd.min.js'));
for(const f of ['lang_af.js','lang_de.js','version.json','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'])if(fs.existsSync(f))fs.copyFileSync(f,path.join(out,f));
for(const d of ['voice','tools','media'])if(fs.existsSync(d))fs.cpSync(d,path.join(out,d),{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),s);
// old browser copy: the main script has a syntax error, so Pesa never starts and the compatibility guard must show its message
const old=path.join(root,'tests','.build_old');fs.rmSync(old,{recursive:true,force:true});fs.cpSync(out,old,{recursive:true});
let o=fs.readFileSync(path.join(old,'index.html'),'utf8');o=o.replace('window.__pesaBoot = true;','window.__pesaBoot = true; @@@');fs.writeFileSync(path.join(old,'index.html'),o);
console.log('built',names.size,'hooks');
