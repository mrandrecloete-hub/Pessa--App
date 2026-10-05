# Setting up a new shop

Each shop keeps its cloud copy in its own free Supabase project, on the shop owner's own account. You never hold a shop's data.

1. The owner creates a Supabase project (strong database password, two factor sign in on the account).
2. In the SQL Editor run `01_pesa_sync_table.sql`.
3. In Pesa: Settings, Advanced Pesa Connection settings. Paste the project URL and the **anon public** key (never the service role key), tap Generate code, tap Turn on sync. New setups are encrypted automatically. The settings page shows an Encrypted sync note when it worked.
4. On every other device: Connect to an existing business, enter the same URL, key and code. The device works out by itself whether the shop is encrypted.
5. Write the sync code in a safe place with the owner (a password manager). If the code is lost the encrypted cloud copy cannot be read by anyone, including you.
6. Ask the owner to make a backup file from Settings now and then. Sync is not a backup: a wrong edit syncs to every device.

For a shop that started before encryption existed: on the owner device tap Upgrade to encrypted sync, then tap it on every other device, then run `02_remove_old_readable_rows.sql` with the shop's code.

The optional accounting ledger table for a shop that wants its books in SQL as well is `docs/accounting/002_accounting_ledger.sql`.

Not covered here, because it is yours to do: your own domain and Cloudflare settings (see `docs/cloud-security-checklist.md`), licence keys (see Licence server below), prices and the lawyer's review (see `docs/LAUNCH_CHECKLIST.md`).

# Licence server (once, for you, not per shop)

This is what makes licence keys automatic. It lives in YOUR OWN Supabase project, separate from every shop's sync project.

1. Create a Supabase project. In the SQL Editor run `03_licence_requests.sql`.
2. Open `tools/issuer.html`, make the signing key pair. Keep the **private** key secret. It is the only thing that can make valid keys.
3. Install the Supabase CLI and log in. From the repo folder run:
   `supabase link --project-ref <your-project-ref>`
4. Set the secrets (the private key is the JSON from the issuer tool, on one line):
   `supabase secrets set LICENCE_PRIVATE_JWK='{"kty":"EC",...}' ADMIN_TOKEN='<a long random phrase only you know>' RESEND_API_KEY='re_...' MAIL_FROM='Pesa Namibia <licences@your-domain>'`
5. Deploy: `supabase functions deploy licence --no-verify-jwt`
   The address is `https://<your-project-ref>.supabase.co/functions/v1/licence`.
6. In `index.html` set `LIC_PUBLIC_KEY` (public key JSON), `LIC_SERVER` (the address above) and `LIC_ENFORCE_FROM` (the day trials start counting). Fill `PAY_DETAILS`. Publish.
7. Open `tools/approve.html`, enter the address and the admin token, tap Save. Pending payments appear there.

Daily use: a shop taps I have paid, you see it in `tools/approve.html`, check the money arrived in your bank, enter the amount and bank reference, tap Payment received, approve. The client gets the proof of payment and licence certificate by email and the app activates by itself within about half an hour, or at once when the owner taps Check now. Renewals add a month to the current end date.

Email: Resend needs a verified sending address or domain. Until it is set up, approving still works and the key reaches the app; the page tells you the email was not sent and you can use `tools/issuer.html` to make the PDFs.

Tests: `node tests/handler_t.mjs` checks the server logic.
