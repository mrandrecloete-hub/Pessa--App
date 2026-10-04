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

Not covered here, because it is yours to do: your own domain and Cloudflare settings (see `docs/cloud-security-checklist.md`), licence keys (`tools/issuer.html`), prices and the lawyer's review (see `docs/LAUNCH_CHECKLIST.md`).
