# Business types in Pesa

Pesa asks "What type of business do you have?" when a business signs up. The answer is stored on the company record as `businessType`.

| Choice | Value | What the owner gets |
|---|---|---|
| Barbershop or Salon | `beauty` | Own dashboard, Appointments, Walk in queue, Clients, Services and prices, Stylist earnings |
| Retail business | `retail` | The full Pesa dashboard, unchanged. Also the default for every business made before this feature |
| Hospitality | `hospitality` | Own dashboard, Room bookings with a 14 day board, Rooms, Tables and tabs, Guests, Licences and levy |

The owner can change the type later from the menu (Business type). Nothing is removed when the type changes. Retail and the full dashboard stay one tap away.

Everything sits on top of the existing app. Services, menu items and drinks are products, so selling, receipts, the till, VAT, reports, accounting and staff all keep working. A booking, a room stay or a tab is charged through the normal Charge sheet and ends as an ordinary sale (with `appointmentId`, `stylistId`, `bookingId` or `tabIds` added). Code: `tools/verticals.js`, embedded as the VERT block with `python3 tools/embed_block.py VERT verticals.js '...'`. Tests: `tests/specs/vert_t.js`.

## What each business type shows and hides

Retail hides nothing. For the other two, the items below are taken out of the menu, the business tools and the Smart Tools list (they are still in the app and come back if the owner changes the business type). The table is `VERT_HIDE` in `tools/verticals.js`.

| Feature | Retail | Barbershop or Salon | Hospitality |
|---|---|---|---|
| Dashboard | Full Pesa dashboard | Salon dashboard | Hospitality dashboard |
| Sell, Till, Expenses, Reports, Messages, Settings | yes | yes | yes |
| Stock (products) | yes | yes, as Products and stock | yes, as Menu and stock |
| Credit (who owes me) | yes | yes | yes |
| Invoices | yes | hidden (salons are paid at the chair) | yes (groups, events, company stays) |
| Point of sale (full screen) | yes | hidden (Sell does the job) | yes (bars and restaurants) |
| Purchase orders | yes | hidden | yes |
| Stock take and variances | yes | hidden | yes (bar and kitchen counts) |
| Wastage and shrinkage | yes | hidden | yes (food waste) |
| Branches | yes | hidden | hidden |
| Suppliers, Reconciliation, VAT, Accountant | yes | yes | yes |
| Employee tracking, payroll, tips, attendance | yes | yes | yes |
| Barcode labels | yes | hidden | hidden |
| Import cost calculator | yes | hidden | hidden |
| Currency and converter | yes | hidden | yes (visitors pay in rand or other currency) |
| Quotes and recurring invoices | yes | hidden | yes |
| Reorder list in Smart Tools | yes | hidden | yes |
| Stock clerk job | yes | not offered | yes (housekeeping or stock) |
| Appointments, walk in queue, clients, services, stylist earnings | not shown | yes | not shown |
| Rooms, bookings, tables and tabs, guests, licences and levy | not shown | not shown | yes |

## Research notes (Namibia)

What was found, and how it shaped the design. These are working notes, not legal advice. Anything about tax, levies or licences is to be confirmed with the relevant legal bodies, authorities and entities of Namibia.

Barbershops and salons
- Namibia has roughly 75 active barbershops (Windhoek, Swakopmund, Walvis Bay and smaller towns): small independents, franchise chains and premium salons with online booking. Services go beyond cuts to beards, colour, scalp treatments and styling. Some work as mobile or "dial a barber" services. (New Era, Fresha listings)
- Home based salons and hair dressers are a major part of the informal economy, which is about a quarter of GDP and employs well over half of workers. Mobile wallets such as Bank Windhoek EasyWallet are aimed at them. (The Namibian, New Era opinion on digital wallets)
- Design result: bookings plus a walk in queue (both are normal), a services menu with minutes and prices, client notes (style, hair type, allergies), WhatsApp reminders (the common channel), stylist commission or weekly chair rent, and charging through the existing cash, card and wallet payment methods.

Hospitality
- Accommodation must be registered with the Namibia Tourism Board, and registered establishments (other than camp sites) pay a levy on room fees. The regulations give 2 percent, with a 5 percent monthly charge on late payment. Pesa only shows an estimate. (Namibia Tourism Board Act 21 of 2000 and the 2004 regulations)
- Selling liquor needs a licence under the Liquor Act 6 of 1998, and a local authority fitness certificate is needed first. Pesa keeps the numbers and renewal dates and raises an alert before they run out.
- Occupancy is seasonal and uneven (national room occupancy about 58 percent in June 2026, above 84 percent in a peak October). Guest houses and lodges often run at different levels. Most international guests are from Germany, Switzerland and Austria. Costs (food, fuel, electricity, wages) are rising. (Namibia Statistics Agency hospitality figures reported by The Brief and The Namibian)
- Design result: rooms with a rate and a clean or dirty status, a 14 day booking board that refuses double bookings, deposits tracked and shown at check out, booking source (Walk in, WhatsApp, Booking.com, Airbnb, agent), open tabs for tables, the bar and rooms that can be added to the room bill, and the levy estimate on the dashboard.

## What is not built yet
- Online booking for customers (Pesa is the owner and staff tool).
- Rate seasons, per person rates and meal plans.
- Kitchen tickets and table maps.
- Stylist and barber self service diaries.
- Automatic WhatsApp reminders (the app opens WhatsApp with the message ready).

## Menus are kept apart (2026.10.163)
Each business type has its own menu and dashboard and nothing from another type. Retail keeps the full Pesa app. Barbershop and salon get Appointments, Walk in queue, Clients, Services and prices, Stylist earnings, plus Messages, Dashboard, Stock (products), Reports, Expenses, Employee tracking, VAT, Accountant, Pay for Pesa, Business type and Settings. Hospitality gets Room bookings, Rooms, Tables and tabs, Guests, Licences and levy, plus the same basics with Invoices. They do not show Sell, Credit, Till, Insights, Business tools, Smart tools, AI Assistant, Reconciliation, Suppliers, Purchase orders, Stock take or Wastage. The lists are `VERT_KEEP` in `tools/verticals.js`. Spec: `vert_t`.
