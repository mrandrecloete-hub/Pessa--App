# NamPromo

Find specials, compare shop prices and plan where to shop in Namibia. Plain HTML, CSS and JS, no build step. Open `index.html` from any web server (for example `python3 -m http.server`).

## What works now
- **Deals**: specials by town and category, sorted by saving, price, ending soon or distance. Each has Navigate (opens turn by turn directions in the phone's maps app).
- **Compare**: one product across every shop in the town, with price per kg, litre or item so pack sizes compare fairly.
- **Where to shop**: a shopping list is priced at each shop. NamPromo picks the best choice counting the trip (distance times the traveller's own cost per km), either one shop or the cheapest shop for each item, and shows the saving.
- **Alerts**: watch a product and set a target price. Notifications show when the app is opened and a target has been reached.
- **Add a deal**: community deals, labelled "not checked", saved on the device only.

## Honest limits
- All shops and prices are **made up sample data** (the shop names start with "Example"). Nothing is a real special. The app says so on every page.
- There is no live feed yet. Real data needs retailer sign up, shared catalogues or sources that allow reuse. Do not copy prices from retailer sites or leaflets without their permission.
- Alerts when the app is closed, shop verification, and sharing community deals between people all need a server (see `docs/backend-schema.sql`, from the DealNam starter, to be reviewed before use).
- Distances are rough straight line estimates scaled for roads.

## Next steps
1. Supabase project and the reviewed schema; retailer sign up and moderation.
2. Real price sources with permission; expiry automation; duplicate handling.
3. Push notifications; branch opening hours; shopper accounts.
4. Package with Capacitor for Android once the web version is tested with shoppers.
