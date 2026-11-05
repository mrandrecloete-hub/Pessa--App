# Pesa Shop live pages (Pesa hosts them)

Pesa Shop can publish a shop's products as a live order page that customers open on their phone and order from on WhatsApp. Pesa hosts these pages for every shop, so the page service lives in YOUR OWN Supabase project (the one that runs the licence server), not in a shop's sync project.

## How it works
- The shop taps **Publish my page** in Enterprise tools, Pesa Shop. The app sends plain data only (shop name, WhatsApp number, two short lines, and for each product an id, name, category, price, unit and whether it is in stock) to the `shop` function. Cost prices, customers and sales are never sent.
- The first publish claims the shop name in the address (for example `mama-ndapewa`). The app makes a long private token on that device and keeps it with the shop settings. The service stores only a hash of it. Only the same token can update, hide or remove that page.
- Customers open `site/shop.html?s=<shop name>` on the Pesa website (GitHub Pages). That static page reads the shop's data from the function and draws it. Supabase does not display web pages sent from a function, which is why the page itself lives on the website.
- While Pesa is open, it re-sends the page every few minutes if stock or prices changed, and only then.

## Set up (once, for you)
1. In the same Supabase project as the licence server, SQL Editor, run `04_pesa_shops.sql`.
2. `supabase functions deploy shop --no-verify-jwt`. The address is `https://<your-project-ref>.supabase.co/functions/v1/shop`.
3. Optional secrets: `supabase secrets set ADMIN_TOKEN='<a long random phrase>'` (needed to take pages down). When licence keys are switched on and you want only licensed shops to publish: `supabase secrets set REQUIRE_LICENCE=1 LICENCE_PUBLIC_JWK='<the public key JSON, one line>'`.
4. Put the function address in two places:
   - `app.js`: the `SHOP_API` line in `tools/enterprise.js` (then `python3 tools/embed_block.py ENT enterprise.js`).
   - `tools/shop_api.txt` (one line), then `node tools/build_shop_viewer.js` to rebuild `site/shop.html`.
5. Release as usual (version, changelog, `node tests/check.js`, push). Until `SHOP_API` is set, the app says live pages are not switched on and only the download, price list and order reading work.

## Taking a page down
`curl -X POST '<function address>?a=disable' -H 'x-admin-token: <ADMIN_TOKEN>' -H 'content-type: application/json' -d '{"slug":"the-shop-name"}'` hides it for everyone and the owner cannot republish it. Use `?a=enable` to allow it again, and `?a=list` (GET) to see every page.

## Safety built in
- Only data is stored, never web page code. The page draws names with escaping, so a product called `<script>` is just text.
- At most 3 new shops a day from one network address, one update every 10 seconds per shop, 3000 products and about 700 KB per page.
- Names must be 3 to 40 letters, numbers and single dashes. Words like admin, pesa, bank and payment are reserved.
- The page asks search engines not to list it (`noindex`) and does not take any payment. The shop confirms stock and price on WhatsApp and charges in Pesa as normal.

## Honest limits
- Anyone with the link can read a published page. Tell shops that what they publish is public.
- The page is drawn in the browser, so it shows no preview picture when shared and Google does not list it. Pretty addresses and previews need a custom domain and a server that draws the page, which is a later step.
- There are no product photos yet and no online card payment.
- Public pages need privacy wording: the shop's WhatsApp number is published. Tax, privacy and records wording is to be confirmed with the relevant legal bodies, authorities and entities of Namibia.

Tests: `node tests/shop_srv_t.mjs` (the service logic), specs `shop_t` and `shoplive_t` (the app, the page and the whole order loop).
