# NamPromo server

Supabase (PostgreSQL + Edge Functions). It stores shops and specials, checks shops and specials before they are trusted, signs shoppers up with a confirmed cellphone number, and sends WhatsApp, SMS and email only to people who agreed and have not said STOP.

**Status:** written and tested against a real PostgreSQL with the WhatsApp and SMS providers faked (`npm test`). It is **not deployed** and has **not been tried against real WhatsApp or SMS accounts**. Someone has to create the Supabase project and the provider accounts (steps below).

## What is in here
| Path | What it does |
|---|---|
| `supabase/migrations/20261008000000_nampromo.sql` | Tables, row level security, moderation functions and the public views. |
| `supabase/functions/np-subscribe` | Shopper sign up. Validates, stores, sends a 6 digit code (WhatsApp first, then SMS, then email). |
| `supabase/functions/np-verify` | Confirms the code, records consent per channel with the wording the person agreed to. |
| `supabase/functions/np-inbound` | Receives replies (WhatsApp webhook or an SMS gateway). STOP withdraws all consent at once. |
| `supabase/functions/np-dispatch` | The daily job: builds digests and price alerts, holds messages between 20:00 and 07:00 (Namibia time), sends what is allowed. |
| `supabase/functions/_shared/` | The logic (`nampromo.mjs`) and database queries (`db.mjs`). |
| `test/` | `sql_test.mjs` (security rules as real database roles) and `flow_test.mjs` (sign up to STOP). |

## Rules the server enforces
- A shop starts as **pending** ("not yet checked"). Only a moderator or admin can verify, reject or suspend it (`moderate_shop`). Owners cannot change their own status, and users cannot make themselves admin.
- A special from a **verified** shop's owner publishes at once. Everything else (unchecked shops, community specials) waits for `moderate_promotion`. The client cannot choose the status.
- The public reads only `public_shops` and `public_promotions`: no contact details, only published specials that have not expired.
- A number only receives deals after the code is confirmed. Consent is stored per channel with the date and wording. At most one deal message per channel per day, nothing at night, STOP is honoured immediately, and 3 codes an hour per number.
- Messaging tables have no public access at all. Only the Edge Functions (server side) read or write them.

## Deploy (someone with the Supabase and provider accounts)
1. Create a Supabase project. Apply the migration (SQL editor, or `supabase db push`).
2. Make yourself an admin once, in the SQL editor: `update public.profiles set role = 'admin' where id = '<your auth user id>';`
3. Secrets: `supabase secrets set PEPPER=<long random> DISPATCH_KEY=<long random> WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_VERIFY_TOKEN=<long random> SMS_API_URL=... SMS_API_KEY=... SMS_SENDER=NamPromo` (add `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM` for email).
4. Deploy: `supabase functions deploy np-subscribe --no-verify-jwt` and the same for `np-verify`, `np-inbound`, `np-dispatch`.
5. WhatsApp: in Meta's WhatsApp Business Platform create a message template named `nampromo_message` whose body is one variable (`{{1}}`), get it approved, and set the webhook to `np-inbound` with your `WHATSAPP_VERIFY_TOKEN`. Verification codes and deals both use this template, so the wording must suit both.
6. SMS: the call in `sendMessage` (`nampromo.mjs`) posts JSON `{to, message, from}` with a Bearer key. Adapt that one call to whichever SMS gateway you choose, and point the gateway's inbound URL at `np-inbound?channel=sms`. Check delivery on Namibian networks and the cost per message first.
7. Schedule: call `np-dispatch` once or twice a day with header `x-nampromo-key: <DISPATCH_KEY>` (Supabase scheduled functions or pg_cron).
8. Add rate limiting in front of `np-subscribe` (Supabase or a CDN), since it is public.
9. In the app, set `window.NAMPROMO_CONFIG = { url: 'https://<project>.supabase.co', anonKey: '<anon key>' }` (never the service key).

## Still to do
- A moderator screen. Until then, moderators run `select public.moderate_shop('<id>', 'verified', 'note');` and `select public.moderate_promotion('<id>', 'publish');` in the SQL editor.
- Connect the app to these functions (`NAMPROMO_CONFIG`), including shop and special posting through Supabase Auth.
- Privacy and consent wording, retention periods, and how personal information is handled and protected: to be confirmed with the relevant legal bodies, authorities and entities of Namibia before launch.
- A real check of shops (registration number, contact) before anything is shown as verified.

## Tests
```
cd nampromo/server && npm install && npm test
```
Needs PostgreSQL 14 or newer binaries (`initdb`, `pg_ctl`, `psql`); set `PGBIN` if they are elsewhere.
