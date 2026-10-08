# NamPromo

Find specials, compare shop prices and plan where to shop in Namibia. Plain HTML, CSS and JS, no build step. Open `index.html` from any web server (for example `python3 -m http.server`).

## What works now
- **Deals**: specials by town and category, sorted by saving, price, ending soon or distance. Each has Navigate (opens turn by turn directions in the phone's maps app).
- **Compare**: one product across every shop in the town, with price per kg, litre or item so pack sizes compare fairly.
- **Where to shop**: a shopping list is priced at each shop. NamPromo picks the best choice counting the trip (distance times the traveller's own cost per km), either one shop or the cheapest shop for each item, and shows the saving.
- **Alerts**: watch a product and set a target price. Notifications show when the app is opened and a target has been reached.
- **Shops**: a directory by category (food and groceries, home, clothing and shoes, electronics, building and hardware, health and beauty, restaurants, farming, vehicles and parts, other). Each shop page shows its prices and specials and a Navigate button.
- **Me**: sign up with full name, email and cellphone number (checked as a Namibian mobile, saved as +264), tick WhatsApp, SMS or email and the categories wanted, with a consent box. Shows message previews. **Nothing is sent yet.**
- **List my shop / Post a special**: any operator can list a shop under a category and post specials. They show as "not yet checked" until confirmed. Anyone can also add a special they saw, shown as "not checked".

## Honest limits
- All shops and prices are **made up sample data** (the shop names start with "Example"). Nothing is a real special. The app says so on every page.
- There is no live feed yet. Real data needs retailer sign up, shared catalogues or sources that allow reuse. Do not copy prices from retailer sites or leaflets without their permission.
- WhatsApp and SMS sending, alerts when the app is closed, shop verification and sharing deals between people all need a server. See `docs/MESSAGING.md`, `docs/backend-schema.sql` (from the DealNam starter) and `docs/backend-additions.sql`. Review them before use.
- Sign up details are saved on the device only for now. Privacy handling is to be confirmed with the relevant legal bodies, authorities and entities of Namibia.
- The shop list is not every operator in Namibia. It only holds sample shops and the shops people register.
- Distances are rough straight line estimates scaled for roads.

## Next steps
1. Supabase project and the reviewed schema; retailer sign up and moderation.
2. Real price sources with permission; expiry automation; duplicate handling.
3. Push notifications; branch opening hours; shopper accounts.
4. Package with Capacitor for Android once the web version is tested with shoppers.

## Server and tests
- The server (Supabase database and Edge Functions) is in `server/`, with its own README. It is written and tested but **not deployed**.
- To connect the app, add `<script>window.NAMPROMO_CONFIG = { url: 'https://<project>.supabase.co', anonKey: '<anon key>' };</script>` before `nampromo.js` in `index.html`. The app then reads real shops and specials from the server, the sample banner goes away, and sign up sends a confirmation code to the person's phone. Posting shops and specials online still needs Supabase sign in in the app and is not connected yet.
- UI checks: `tests/ui_test.js` and `tests/live_test.js` (Playwright, serve this folder on port 8944 first). Server checks: `cd server && npm install && npm test`.
