# Pesa platform server

Your own Supabase project that powers Pesa from the centre. It is separate from each shop's own sync project and it holds **no shop sales, stock or customer data**.

**Note:** the Pesa app no longer has a Developer panel (it was removed when Pesa was restored to the full app for everyone in 2026.10.163), so `pesa-dev` is not used by the app today. The sending and STOP parts can still be used.

**Status:** written and tested against a real PostgreSQL (`npm test`), with the WhatsApp and SMS providers faked. It is **not deployed**, and it has not been tried against real WhatsApp or SMS accounts. Someone has to create the Supabase project and the provider accounts.

## What it does
| Part | What it does |
|---|---|
| `pesa-dev` function | Developer panel login. The password is checked on the server. The app gets a token signed with a private key only the server holds, and checks the signature with the public key. The master can give helpers access and remove them. 5 wrong tries lock a username or an address for 5 minutes. Every login is in an audit table. |
| `pesa-send` function | Central WhatsApp and SMS sending for shops. Each shop has its own key (only a hash is stored), a daily limit by plan, and must say the customer agreed. Messages end with "Reply STOP to stop." |
| `pesa-inbound` function | Customers replying STOP (WhatsApp webhook or SMS gateway). A stop applies to every shop. |
| Licences | Already exist in `supabase/functions/licence`. Unchanged. |
| Central backup and sync | Not new code. The app's cloud sync already accepts any Supabase address. Run `docs/provisioning/01_pesa_sync_table.sql` in a project of yours and give shops that address. **Read the privacy note below first.** |

## Deploy
1. Create a Supabase project. Apply `supabase/migrations/20261008100000_platform.sql` (SQL editor or `supabase db push`).
2. `node tools/make_keys.mjs` on your computer. Put the PRIVATE key in Supabase secrets as `DEV_PRIVATE_JWK` and the PUBLIC key as `DEV_PUBLIC_JWK`. Keep the private key out of the repository.
3. `node tools/make_master.mjs` on your computer: type your username and password (hidden). Run the SQL it prints in the Supabase SQL editor. The password is never saved.
4. Secrets for sending: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE` (default `pesa_message`, one text variable), `WHATSAPP_VERIFY_TOKEN`, `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER`. The SMS call in `_shared/send.mjs` is a generic JSON gateway: adapt that one call to the provider you choose.
5. `supabase functions deploy pesa-dev --no-verify-jwt`, and the same for `pesa-send` and `pesa-inbound`. Point the WhatsApp webhook and the SMS inbound URL at `pesa-inbound`.
6. Give a shop sending access: `node tools/make_shop.mjs "Shop name" owner@email.com starter`. Give the shop the key it prints and run the SQL.
7. In the app, in `tools/verticals.js`, set `DEV_SERVER` (the `pesa-dev` function address) and `DEV_PUBLIC_JWK` (the public key), then `python3 tools/embed_block.py VERT verticals.js` and release. From then on the Developer panel checks your server and no password or hash is in the app.
8. Add rate limiting in front of the public functions (Supabase or a CDN).

## Honest limits
- The gate in the app is still a lock for ordinary shop staff, not full security. The app's code is on every phone, so a technical person could edit their own copy. The server makes the login real and removes the password from the app, but the full features themselves are not moved to the server.
- **Central sync changes Pesa's privacy promise** ("no central server trackers" and "your data stays on your device first"). Hosting every shop's records needs a privacy and legal review, clear shop consent and updated wording. It should be to be confirmed with the relevant legal bodies, authorities and entities of Namibia before any shop's data is held centrally. The same applies to the customer phone numbers that pass through the sending service.
- WhatsApp needs an approved message template. SMS needs a gateway account. Both cost money per message, so decide how shops are billed.
- Messages are only as consented as the shop says they are. The server records that the shop confirmed consent, and it honours STOP everywhere.

## Tests
```
cd pesa-server && npm install && npm test
```
Needs PostgreSQL 14 or newer binaries (`initdb`, `pg_ctl`, `psql`). Set `PGBIN` if they are elsewhere. The app side is tested by `tests/specs/devserver_t.js`.
