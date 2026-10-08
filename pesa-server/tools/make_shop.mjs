// Makes a shop account for the central sending service:  node tools/make_shop.mjs "Shop name" owner@email.com starter
// Prints the shop's key ONCE (give it to the shop) and the SQL to run in the Supabase SQL editor. Only a hash of the key is stored.
import { createHash, randomBytes } from 'node:crypto';
const [name, email, plan = 'starter'] = process.argv.slice(2);
const limits = { starter:50, business:200, premium:1000 };
if(!name || !limits[plan]){ console.log('Usage: node tools/make_shop.mjs "Shop name" owner@email.com starter|business|premium'); process.exit(1); }
const key = 'pesa_' + randomBytes(24).toString('hex'), hash = createHash('sha256').update(key).digest('hex'), q = (s) => String(s || '').replace(/'/g, "''");
console.log(`Shop key (shown once, give it to the shop): ${key}\n\nRun in the Supabase SQL editor:\n\ninsert into public.shops (name, owner_email, api_key_hash, plan, daily_limit) values ('${q(name)}', '${q(email)}', '${hash}', '${plan}', ${limits[plan]});`);
