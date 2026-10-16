# Pesa for bigger operations

This page compares what a large operation (many items, many branches, many staff, an online shop and table service) needs with what Pesa already did, and says what was added in 2026.10.182. Code: `tools/enterprise.js` (the ENT block, embedded in `app.js` with `python3 tools/embed_block.py ENT enterprise.js`). Tests: `tests/specs/ent_t.js`.

## The enterprise migration that was reviewed

A proposed Supabase migration and React component (matrix inventory, shifts, e-commerce sync log, hospitality tables) were checked against Pesa. Pesa does not use those tables or that component: the app is plain JavaScript and every record is a document in a synced collection (`Store.collection(name)`), saved on the device first and then sent to the shop's own `pesa_docs` table. The ideas were built on that model instead, so the SQL does not need to be run and nothing in the existing database setup changes.

| Proposed table or field | Pesa version |
|---|---|
| `products.parent_id`, `variant_attributes` | `parentId`, `parentName`, `variantAttrs` on ordinary products |
| `staff_shifts` (clock in, out, break) | the existing `clockLogs` collection, now with `breaks:[{from,to}]` |
| `ecommerce_sync_logs` | `channelLogs` collection (orders and stock lines, each with a status) |
| `hospitality_tables` (active cart per table) | the existing `hosTabs` (tabs and tables), plus `kitchenTickets` |

## What Pesa already had

Sell, till and cash up, point of sale terminal, branches (records belong to a branch), purchase orders, suppliers and supplier reconciliation, stock take and variances, wastage, batches and expiry, barcodes and labels, loyalty, quotes and recurring invoices, VAT in cents with rate history, an accountant page with filed monthly packs, payroll and payslips, attendance with clock in and out, tips, roles (owner, manager, cashier, stock clerk), refunds and voids with manager approval, audit trail, backups and recovery, offline use with sync, and the three business types (retail, barbershop and salon, hospitality with rooms, bookings and tabs).

## Added in 2026.10.182

| Need | Where | Notes |
|---|---|---|
| Product families (matrix inventory) | Business tools, Enterprise tools, Product families | Up to three options (colour, size, style) and 200 variants in one go. Each variant is a normal product, so selling, scanning, counting and the books are unchanged. Colour by size stock grid and one step price change for the whole family |
| Branch dashboard | Enterprise tools | Sales, profit, number of sales and stock at cost for every branch side by side, today, this month or this year, with a CSV download |
| Stock transfers between branches | Enterprise tools | Send (stock leaves the first branch at once), then Received (it joins the second branch). Stock in transit is not counted in either branch. Stock moves are recorded for both steps |
| Online shop and sales channels | Enterprise tools, Sales channels | WooCommerce, Shopify, BigCommerce or CSV orders are read, matched to products by barcode (used as the SKU) or exact name, and recorded through the normal Charge sheet so receipts, VAT, the till and the books apply. The same online order cannot be recorded twice. A stock file (CSV) and a stock queue keep the online shop in step |
| Kitchen and bar tickets | Tab form, Send to kitchen and bar. Menu, Kitchen and bar board (hospitality) | New items on a tab become one kitchen ticket and one bar ticket, each sent once. The board shows new, preparing, ready and served with a timer. Which category goes to the kitchen or the bar can be set |
| Breaks on shifts | My shift card | Start and end a break. Break time is taken off the hours worked, so it also lowers hourly pay runs. Clocking out ends an open break |

## What is not built yet

Be clear with a customer about these before they buy for a large operation.

- **Live connection to an online shop.** Pesa does not log in to WooCommerce, Shopify or BigCommerce and does not receive their webhooks, because the app has no server of its own. Orders are pasted or loaded as JSON or CSV. Stock updates are sent only to a web address (https) that the owner types in, for example their own small service or an automation tool, and are kept in a queue when it cannot be reached. A built in connector needs a server component (see `supabase/functions`).
- **Kitchen printers and a separate kitchen screen.** The board runs on any device signed in to the business. Tickets can be copied as text. Network receipt or kitchen printers are not supported.
- **Table map and split bills.** Tabs are listed, not drawn on a floor plan. Splitting one tab between payers is not built.
- **Recipes and ingredient stock (bill of materials), modifiers.**
- **Approval chains** such as purchase orders above a limit needing the owner. Refunds and removals already need a manager or owner password.
- **Price lists** (wholesale and retail prices for different customers) and **layby**.
- **Central head office view across separate businesses.** The branch dashboard covers branches inside one business.
- **Roster planning and overtime rules.** Shifts record hours and breaks only.

Tax, privacy and records wording in the app is to be confirmed with the relevant legal bodies, authorities and entities of Namibia.
