# Developer panel

Every retail owner and manager sees the **simple view**: the short menu (Messages, Dashboard, Sell, Stock, Credit, Expenses, Reports, Settings) and the simple dashboard. The full app is behind the **Developer panel**, which asks for a username and password. Barbershop, salon and hospitality accounts keep their own dashboards. Cashiers and stock clerks keep their own limited pages.

## For the developer
1. On your own computer run `node tools/make_dev_hash.mjs`. Type your username (your email) and a password of at least 12 characters. The password is typed hidden and is not saved. Only a salted PBKDF2 SHA 256 hash is written into `tools/verticals.js` (`DEV_SALT`, `DEV_HASH`).
2. `python3 tools/embed_block.py VERT verticals.js`, then release as usual. Never put the password in the repository, a chat or a spec.
3. In the app: Dashboard, small "Developer panel" link at the bottom. After login the full app opens on that device. It locks again when the app is closed, after 8 hours, or when you tap "Lock and go back to the simple dashboard". A menu row "Developer panel" appears while unlocked.
4. **People with access:** in the panel (master login only) give a name, username and password of at least 10 characters. Only a salted hash is stored (in the shop's synced settings). Remove access in the same list. People with access can unlock the full app but cannot manage the list.
5. Five wrong tries lock the panel on that device for 5 minutes.

## Server mode (recommended)
Instead of a hash inside the app, run the Pesa platform server (`pesa-server/`). The password is then checked on your server, the app only holds the public key, and helpers are managed on the server. See `pesa-server/README.md`. Set `DEV_SERVER` and `DEV_PUBLIC_JWK` in `tools/verticals.js`. Local mode (the hash made by `make_dev_hash.mjs`) still works when they are empty.

## What this is, and is not
This is a gate inside the app for ordinary shop staff. It is **not server side security**. Someone technical can edit their own copy of the app or the browser storage and get past it, and the salted hashes travel with the app and the synced settings so a very weak password could be guessed offline. For a real lock, check the developer's login on a server (for example Supabase Auth) and send the full app features only to that signed in account. Use a long unique password, and change any password that has been shared in a message.

## Tests
`tests/specs/simple_t.js` uses a throw away login it creates itself. The test build (`tests/build.js`) sets `DEV_TEST_BYPASS = true` so the other specs see the full app; the production `app.js` keeps it `false`. A spec that wants the real gate sets `window.__forceSimple = true` before the page loads.
