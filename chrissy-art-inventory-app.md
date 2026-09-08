# Chrissy's Art Inventory & Checkout App

A native mobile app for Four Seasons Studio to track art inventory via barcode scanning and take payments (Square, Venmo, PayPal) at shows and in the studio.

## Goals

- Generate a barcode per piece of art (originals) or per SKU (prints)
- Scan a barcode to add an item to a cart
- Checkout via Square card reader, or manually log Venmo/PayPal payments
- Automatically update inventory status when an item sells
- Track processing fees per sale across all payment methods
- Keep monthly software cost at $0 — app is the inventory source of truth, Square is used only for card processing on its free plan

## Tech Stack

- **React Native** — single codebase for iOS + Android
- **Square Mobile Payments SDK** (React Native wrapper) — pairs with Square Reader for Contactless and Chip via Bluetooth
- **Barcode scanning** — `react-native-vision-camera` + barcode-scanning plugin (uses phone camera, no extra scanner hardware)
- **Database** — Postgres (or Supabase/Firebase to avoid managing a server)
- **Barcode generation** — Code128 or QR encoding of each piece's SKU, printed via label printer or sticker paper

## Hardware

- Square Reader for Contactless and Chip (2nd gen) — ~$59 one-time, Bluetooth, no monthly fee
- Label printer for barcodes (~$30–50) or home printer + sticker paper

## Database Schema (draft)

```
pieces
├── id (primary key)
├── sku (unique, barcode-encoded value)
├── title
├── medium
├── width_in / height_in
├── series
├── price
├── cost_basis            // optional: materials + labor
├── status                // "available", "sold", "reserved"
├── type                  // "original", "print", "sticker", or other category as needed
├── original_id           // FK to original piece, if type = print
├── print_run_size        // total run size, if type = print
├── quantity_remaining    // for prints/stickers with multiple units; originals default to 1
├── date_created
├── date_sold
├── sale_channel          // "show", "online", "studio"
└── notes

sales
├── id
├── piece_id (FK)
├── sale_price
├── tip_amount            // optional, cash/Venmo/PayPal only
├── payment_method        // "square", "venmo", "paypal", "cash"
├── fee_amount            // calculated processing fee for this sale
├── sale_date
├── square_payment_id     // reference to Square transaction, if applicable
└── location              // which show/venue
```

## Payment Methods

| Method | Integration | Fee (2026 rates) |
|---|---|---|
| Square (card/tap) | Mobile Payments SDK, Bluetooth reader | 2.6% + $0.10 |
| Venmo | Manual — buyer scans seller's Venmo QR, seller taps "Confirm Paid" | 1.9% + $0.10 (Business profile) |
| PayPal | Manual — buyer scans seller's PayPal QR/handle, seller taps "Confirm Paid" | 2.99%–3.49% + $0.49 depending on payment type |
| Cash | Manual entry | none |

Fee calculation: `fee = (cart_total × rate%) + fixed_fee`, stored per sale in the `fee_amount` field. Decide whether the fee reduces net revenue shown to Chrissy/Missa, or is passed on to the buyer at checkout (check card network surcharge rules by state if passing on the Square fee).

**Tipping**: an optional tip field is available at checkout for Cash, Venmo, and PayPal payments (not Square/card, since Square's SDK checkout flow doesn't include a tip step in this plan). Tip amount is stored separately in `tip_amount` on the sale record, and is not counted toward `sale_price` (so per-piece revenue and tip income can be reported separately).

## Bundles & Deals

Deals auto-apply as items are scanned into the cart. If multiple deals could apply, the app picks whichever single deal saves the customer the most.

### Data model

```
deals
├── id
├── name                    // e.g. "Buy 2 Prints, Get 10% Off"
├── type                    // "bundle_price", "percent_off", "amount_off", "bogo"
├── trigger_condition       // rule describing what qualifies (quantity, category, or fixed set)
├── discount_value          // e.g. 10 (%), 25 (flat $), or a fixed bundle price
├── stackable               // whether this deal can combine with others, or competes for the same items
├── active                  // on/off toggle
├── start_date / end_date   // optional, for limited-time show promos
└── applies_to              // "all", specific series, specific type (print/original), specific SKUs
```

Trigger conditions are stored as structured rule data (not free text), e.g.:
- Quantity-based: "3+ prints in cart"
- Category-based: "1 print + 1 original from same series"
- Fixed set: "any 2 items from a named series"

### Auto-apply logic

On every scan, re-evaluate the full cart against all active deals:
1. Find every deal whose trigger condition is currently met.
2. For non-stackable deals competing over the same items, calculate the discount each would produce and keep only the one with the largest total discount.
3. Stackable deals (flagged `stackable: true`) can combine with the winning non-stackable deal.
4. Show the applied deal clearly at checkout (e.g., "Bundle applied: 3 prints for $75 — saved $15"), with any skipped/overridden deals visible but greyed out.
5. Optional upsell prompt when a cart is one item away from unlocking a deal (e.g., "Add 1 more print to unlock this bundle").

Cart sizes at a booth are small, so re-running this check on every scan is cheap — no performance concerns.

## Reports

End-of-day (or any date range) sales reporting, pulled from the `sales` + `pieces` tables.

- **Filters**: item type (original, print, sticker, or any other category), series, payment method, date range, sale channel (show/online/studio)
- **Report contents**: list of individual sales matching filters, plus summary totals — gross sales, total fees deducted, tips collected, net revenue, item count
- **Common views**: "today's sales," "this show's sales" (by date range or location), "sales by type" breakdown
- Since `type` on `pieces` is an open category field (not just original/print), reports can filter/group by whatever categories Chrissy actually sells (originals, prints, stickers, etc.) without schema changes later

## Recommended Additions

### High priority — build in from the start
- **Sales tax handling** — `tax_rate` field per sale or per venue, auto-calculated at checkout. Rates can vary by city/county for shows outside Bemidji, so make this configurable per venue rather than hardcoded.
- **Offline mode** — if a DB write fails (spotty show wifi), queue the sale locally and sync once connection returns. Square's SDK already supports offline card payments; this mainly covers your own DB writes and Venmo/PayPal/cash manual entries.
- **Refund/void support** — ability to void a sale and restore the piece's inventory status cleanly, without manual DB edits.

### Nice-to-haves
- **Customer info capture (optional)** — simple "email for receipt / mailing list" field at checkout, useful for building a collector list.
- **Digital receipts** — email/text a receipt after checkout (Square's SDK supports this for card payments; build a simple version for cash/Venmo/PayPal).
- **Low-stock alerts** — quiet flag when a print's `quantity_remaining` gets low, so restocking/reordering happens before running out mid-show.
- **Multi-device sync** — if running more than one tablet/phone at a booth, all devices should see the same live inventory in real time so the same print doesn't get sold twice.

### Lower priority, easy to add while building
- **Photo per piece** — helps visually confirm the right item was scanned, especially for similar-looking prints.
- **Venue/show list** — simple lookup for show name/location instead of retyping it each time; ties into `sale_channel`/`location` fields already in the schema.

## Hardware — Barcode Scanner for Dedicated Show Tablet

For a dedicated iPad/tablet setup at shows, a plain **Bluetooth HID-mode 1D/2D barcode scanner** (~$50–90) is the simplest option: it pairs like a wireless keyboard and "types" the scanned SKU into whatever text field is focused in the app — no app-specific SDK integration required. Have the cart screen's barcode input auto-focus so scans land there directly.

**Chosen: Eyoyo Portable Mini Bluetooth 2D&1D Barcode Scanner** ($49.99) — Bluetooth/2.4G/USB 3-in-1, reads both 1D and 2D/QR codes, 8-hour battery + 180-day standby, auto-sensing/key-trigger/continuous scan modes, 150,000-barcode offline storage (pairs well with the app's offline mode).

Other options considered: Zebra CS60, Socket Mobile S740 (both pricier/harder to find), Inateck BCST-70 (initial pick, 1D only), Inateck BCST-73, NETUM NT-1228BC, Tera D6100.

## Finalized Show Hardware Cart

| Item | Price |
|---|---|
| Fintie Shockproof Case w/ kickstand (for iPad) | $15.99 |
| Eyoyo Portable Mini Bluetooth 2D&1D Barcode Scanner | $49.99 |
| Square Reader for Contactless and Chip (2nd Gen) | $58.99 |
| Apple iPad 11-inch (A16 chip) | $399.00 |
| **Total** | **~$523.97** |

Still needed: sticker/label paper for the existing home printer, to print barcode labels.

The phone-camera scanning (`react-native-vision-camera`) built into the app remains useful as a backup method or for the non-dedicated-tablet setup.

## Hardware — Dedicated Show Tablet

**Recommendation: iPad (10th generation), ~$349** — plenty of power for a simple inventory/checkout app, has USB-C, no need to pay for Pro-level processing that won't be used. **iPad Air** is a reasonable step up if a larger/nicer screen is wanted for customers browsing alongside checkout. Skip iPad Pro — its extra power (ProMotion, M-series chip) isn't needed here.

- **Cellular vs. wifi-only**: cellular model preferred if budget allows, or plan to hotspot from a phone — show venues often have unreliable wifi, and a connection is needed for card processing and DB syncing even with offline mode as a fallback.
- **Case with a kickstand or stand** — to prop up at the booth rather than hold, especially since customers may view the screen during checkout.
- iPad (vs. Android tablet) is the safer choice given React Native + Square SDK maturity and iPad hardware consistency for a dedicated show device.

## Print Availability Policy (business decision, not app-specific)

Considering: don't release prints of a piece until the original sells.

- **Pros**: protects original's exclusivity, creates urgency, avoids a cheap print undercutting an unsold original at a show
- **Cons**: loses smaller print sales while original is unsold, some buyers only want prints regardless
- **Middle ground**: hold prints back only for new/recent work, open prints up after a piece has been available a while without selling
- The `original_id` link in the schema supports gating prints in the app based on the linked original's `status`

## Open / Next Steps

- [ ] Confirm Square developer account setup and Mobile Payments SDK access
- [ ] Decide: fee reduces payout vs. passed to buyer
- [ ] Design barcode label layout
- [ ] Build cart UI + checkout flow
- [ ] Build "Confirm Paid" manual flow for Venmo/PayPal
- [ ] Set up DB (Postgres or Supabase/Firebase)
- [ ] Decide print-release policy for existing vs. new work
- [ ] Define a few real starter bundles/deals (specific series or print/original combos) to seed the `deals` table
- [ ] Build end-of-day / date-range sales report screen with type, series, payment method, and channel filters
- [ ] Add sales tax config per venue and auto-calculate at checkout
- [ ] Implement offline queueing for DB writes when connection drops
- [ ] Build refund/void flow that restores inventory status
- [ ] Decide on customer info capture + digital receipts
- [ ] Add low-stock alerts for prints
- [ ] Plan multi-device sync if more than one tablet/phone is used at a booth
- [ ] Buy sticker/label paper for existing home printer (barcode labels)
- [x] Purchase Eyoyo Bluetooth 2D&1D barcode scanner for the dedicated show tablet
- [x] Purchase dedicated show tablet (iPad 11-inch A16) + Fintie kickstand case
