// Makes the SQL for the master developer login. Run on YOUR computer:  node tools/make_master.mjs
// Asks for the username and password (typed hidden, never saved) and prints one INSERT with a salted hash. Paste it into the Supabase SQL editor.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import readline from 'node:readline';
function ask(q, hidden){ return new Promise((res) => { const rl = readline.createInterface({ input:process.stdin, output:process.stdout, terminal:true }); if(hidden) rl._writeToOutput = (t) => { if(t.includes(q)) rl.output.write(t); }; rl.question(q, (a) => { rl.close(); if(hidden) process.stdout.write('\n'); res(a); }); }); }
const user = (await ask('Master username (your email): ')).trim().toLowerCase();
const pass = await ask('Master password (hidden, at least 12 characters): ', true);
if(user.length < 3 || pass.length < 12){ console.log('Need a username and a password of at least 12 characters.'); process.exit(1); }
if((await ask('Type the password again: ', true)) !== pass){ console.log('The passwords do not match.'); process.exit(1); }
const salt = randomBytes(16).toString('hex'), hash = pbkdf2Sync(user + '\n' + pass, Buffer.from(salt, 'hex'), 210000, 32, 'sha256').toString('hex');
console.log(`\nRun this once in the Supabase SQL editor:\n\ninsert into public.dev_users (username, name, role, salt, hash, iterations) values ('${user.replace(/'/g, "''")}', 'Developer', 'master', '${salt}', '${hash}', 210000);`);
