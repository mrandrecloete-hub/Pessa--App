// Makes the developer panel's master login. Run it on YOUR computer:   node tools/make_dev_hash.mjs
// It asks for the username and password (the password is typed hidden and is never saved anywhere), then writes only a salted PBKDF2 hash into tools/verticals.js.
// Then embed and release as usual:  python3 tools/embed_block.py VERT verticals.js
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
const ITER = 210000;
function ask(q, hidden){
  return new Promise((res) => {
    const rl = readline.createInterface({ input:process.stdin, output:process.stdout, terminal:true });
    if(hidden){ rl._writeToOutput = (t) => { if(t.includes(q)) rl.output.write(t); }; }
    rl.question(q, (a) => { rl.close(); if(hidden) process.stdout.write('\n'); res(a); });
  });
}
const user = (await ask('Developer username (your email): ')).trim().toLowerCase();
const pass = await ask('Developer password (hidden, at least 12 characters): ', true);
if(!user || pass.length < 12){ console.log('Need a username and a password of at least 12 characters.'); process.exit(1); }
const again = await ask('Type the password again: ', true);
if(again !== pass){ console.log('The passwords do not match.'); process.exit(1); }
const salt = randomBytes(16), hash = pbkdf2Sync(user + '\n' + pass, salt, ITER, 32, 'sha256');
const file = new URL('./verticals.js', import.meta.url);
let s = readFileSync(file, 'utf8');
const re = /var DEV_SALT = '[0-9a-f]*', DEV_HASH = '[0-9a-f]*',/;
if(!re.test(s)){ console.log('Could not find DEV_SALT in tools/verticals.js'); process.exit(1); }
s = s.replace(re, `var DEV_SALT = '${salt.toString('hex')}', DEV_HASH = '${hash.toString('hex')}',`);
writeFileSync(file, s);
console.log('Done. tools/verticals.js now holds the salted hash only. Next: python3 tools/embed_block.py VERT verticals.js');
