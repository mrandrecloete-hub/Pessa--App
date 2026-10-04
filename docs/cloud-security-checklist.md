# Pesa cloud security checklist

Pesa has no server of its own. Each shop keeps its data on its own devices and, if it turns on cloud sync, in its own free Supabase project. You, the seller, never hold a shop's sales, customers or staff records. This keeps your legal exposure small, and it is a selling point. It also means the points below are the ones that matter.

## 1. What is already built in

* Passwords and PINs are stored salted and slowed down (PBKDF2, SHA 256, 150,000 rounds). Older accounts upgrade the next time they sign in.
* Sign in locks for a minute, then longer, after three wrong tries, and every lock is written to the audit log.
* Each shop's cloud rows are protected by row level security. A request only sees rows whose `ws` equals the sync code sent in the `x-pesa-code` header.
* Generated sync codes are 20 characters from a 31 letter alphabet (about 99 bits). The app now refuses codes shorter than 16.
* The page carries a Content Security Policy.

## 2. For every shop that turns on cloud sync (put this in your onboarding)

1. Create the Supabase project on the shop owner's own account. Use a strong database password and turn on two factor sign in for the Supabase account.
2. Run the setup script from the app (Settings, Cloud sync, Copy setup script) in the SQL Editor. The current script enables row level security, removes all other access, and rejects short codes and oversized records.
3. Paste only the **anon public** key into Pesa. Never paste the **service_role** key anywhere. If someone has, rotate it at once in Supabase, Project Settings, API.
4. Generate the sync code in Pesa. Do not type your own. Share it only with devices that belong to the business.
5. In Supabase, Authentication, make sure sign ups are not needed (Pesa does not use Supabase accounts). Turn on "Enforce SSL" under Database settings.
6. Confirm in Table Editor that `pesa_docs` shows **RLS enabled**.
7. Check that the owner makes a backup file from Settings now and then. Cloud sync is not a backup: a wrong edit syncs to every device.

### If a sync code or the anon key leaks

Anyone with both the key and the code can read and change that shop's data. To recover: on the owner device generate a new code, turn sync on again with it, reconnect the other devices with the new code, then delete the old rows in Supabase (`delete from pesa_docs where ws = 'OLD-CODE';`). Rotating the anon key as well is best when the key itself leaked.

## 3. Honest limits you should tell buyers

* Pesa data inside the shop's Supabase project is stored as readable JSON. It is not encrypted by Pesa. Anyone who can open the shop's Supabase dashboard can read it. Client side encryption is a possible next step, but it would stop older app versions from reading synced rows, so it needs a staged rollout.
* The sync code works like a key. There are no per person cloud accounts, so a person who knows the code is trusted as the business.
* A 4 digit PIN can always be guessed given the stored hash, whatever the hashing method. PIN safety rests on the lockouts and on not leaking the data. Use passwords for owners and managers, PINs only for cashiers.

## 4. Your own site and domain (Cloudflare)

GitHub Pages cannot set security headers or rate limits by itself. Putting your own domain in front fixes that.

1. Buy a domain and add it to a free Cloudflare account. Turn on two factor sign in there.
2. Point the domain at GitHub Pages (CNAME) with the orange cloud (proxy) on. In GitHub, Settings, Pages, set the custom domain and tick **Enforce HTTPS**.
3. Cloudflare, SSL/TLS: set mode **Full (strict)**. Turn on **Always Use HTTPS**, **HSTS** (start with 6 months) and **Automatic HTTPS Rewrites**.
4. Security, WAF: turn on the managed rules. Add a rate limiting rule such as 100 requests per minute per IP for the whole site.
5. Security, Bots: turn on **Bot Fight Mode**.
6. Rules, Transform Rules, add response headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=()` (leave microphone and camera allowed only if you use the voice studio and barcode scanning, then use `camera=(self), microphone=(self)`).
7. Caching: do **not** cache `sw.js` or `index.html` for long. Set Browser Cache TTL to "Respect existing headers".

## 5. Protect the code and your keys

* Turn on two factor sign in on GitHub. Protect the `main` branch so it needs a pull request, or at least disallow force pushes.
* Never commit your licence **signing private key**. It must live only in your password manager and in the browser or computer you issue keys from. Anyone who gets it can create valid licence keys.
* Keep a copy of the private key in two safe places. If you lose it you cannot issue new keys for existing shops without shipping a new public key to everyone.
