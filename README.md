# Chrissy's Studio — Checkout & Inventory App

Native iOS app (Expo/React Native) for Four Seasons Studio: barcode-scan
inventory, cart, and checkout via Square reader / manual Venmo-PayPal-cash.

Design doc / schema / decisions: [`chrissy-art-inventory-app.md`](./chrissy-art-inventory-app.md).

## Status

Inventory + Cart + manual-payment Checkout + the deals engine are working
end-to-end against a live Supabase project with real inventory data. Square
card payments and barcode scanning aren't wired up yet — both need a physical
device and are blocked on accounts (see checklist).

The app opens on a **Customer view** by default; a "Staff Access" PIN unlocks
**Admin** (Inventory/pricing/stock, Cart/Checkout, Deals). See "Admin vs.
Customer" below.

## Stack

- Expo (React Native + TypeScript) — chosen over bare RN so iOS builds can run
  on Expo's cloud Mac fleet (EAS Build); no local Mac needed on this Windows machine.
- Supabase (Postgres), project `majsosgcgydpgelkpdpj` — live. `pieces`, `sales`,
  and `deals` are all real tables the app reads/writes; nothing's in-memory-only
  anymore except the cart itself (which should be ephemeral).
- `mobile-payments-sdk-react-native` (Square's official plugin) for card
  payments via the Bluetooth reader — not yet installed; needs a custom dev
  client (Expo Go can't load native modules).

## Setup checklist

**Blocking — only you can do these:**

- [ ] **Apple Developer Program enrollment** ($99/yr, developer.apple.com) —
      required to install dev builds on the iPad past the 7-day free-provisioning
      limit, and eventually to distribute the finished app. Start this first;
      Apple's verification can take a day or more.
- [ ] **Square Developer account + Application** (developer.squareup.com) —
      create an Application, grab the Application ID + sandbox access token.
      Square's Mobile Payments SDK also requires agreeing to their terms for
      production (card-present) access — do this before the reader arrives so
      it's not the last thing blocking a real test swipe.
- [x] **Supabase project** — created, migrated, and seeded (pieces + example
      deals). `.env` has the real URL/anon key (gitignored — if this repo
      moves to a new machine, copy `.env.example` and refill it).
- [ ] **Real stock counts** — Chrissy has an internal spreadsheet
      (`Inventory.xlsx`, `mfpStudios` sheet) tracking real per-size stock, and
      its `Original` prices are already pulled into `seedPieces.ts`/`seed.sql`.
      But each size column (4x6, 5x7, 8x10, 5x5, 8x8, Stickers, Post Cards)
      has two numbers and only one is labeled (e.g. "Exhaustive Life of a Cat"
      4x6 shows `2` then `9`) — Chrissy needs to clean that sheet up before we
      can tell which number is current stock vs. sold-to-date. Until then,
      print/sticker/pin `quantity_remaining` stays a **placeholder** (10/25/15).
      Also not yet in the app: "Behind the Smile" ($390) and "Best in Show"
      ($180), which are in her spreadsheet but not on the live site yet.

**Once Apple/Square exist:**

- [ ] `npm install -g eas-cli` + `eas login`, then `eas build:configure` to set
      up a development build (needed the moment we add the Square SDK or
      vision-camera, since those are native modules Expo Go can't run).
- [ ] Regenerate `src/types/database.ts` from the real schema:
      `npx supabase gen types typescript --project-id <id> > src/types/database.ts`
      — note it'll come back as `interface`s; convert to `type` aliases or
      `.insert()`/`.update()` calls break (see the type-safety note below).

**To try the deals engine:**

- [ ] Run `supabase/seed_deals.sql` in the SQL editor (not run yet) — it adds
      3 example deals so there's something for the engine to auto-apply.
      Replace these with Chrissy's real picks whenever she has them; that's a
      row edit in Supabase, no app change needed.

## Admin vs. Customer

The app has two modes, switched via `AppModeContext` (`src/context/AppModeContext.tsx`):

- **Customer** (default, no login) — read-only: shows whatever's currently in
  the cart (items, subtotal, applied deals, total) and nothing else. No
  buttons that change anything. A small, deliberately unobtrusive "Staff
  Access" link at the bottom is the only way out of this screen.
- **Admin** — the Inventory/Cart/Deals tabs from before, plus a "Customer
  View" button in the header of every admin screen to go back. Reached by
  tapping "Staff Access" and entering the PIN.

**The PIN is `EXPO_PUBLIC_ADMIN_PIN` in `.env`, defaulting to `1234` if
unset** (`src/lib/adminPin.ts`). This is a deterrent, not real security —
`EXPO_PUBLIC_*` vars are bundled into the client JS in plaintext, so anyone
who inspects the app bundle can read it. It's meant to stop a customer from
casually poking at pricing/inventory/deals while the iPad's in their hands,
not to protect real secrets. **Change it from the default 1234 in `.env`
before using this at a real show.**

## What's already here

- **Inventory tab** (admin) — real catalog (128 items: originals + their
  print/sticker/pin/postcard variants), sold items shown but disabled. Pin
  ($3) and postcard ($5) pricing comes from Chrissy's spreadsheet's "2026
  Calculations" sheet; most of their stock counts are real (the sheet's
  column was unambiguous for them even where prints/stickers weren't) — a few
  postcard rows still fall back to the same placeholder as prints, flagged in
  `seedPieces.ts`. Each row has an **Edit** button (`EditPieceScreen.tsx`) to
  change price and stock quantity directly against Supabase — this is how to
  fix the placeholder stock counts once Chrissy has real numbers, no SQL
  needed. Editing quantity back above 0 un-marks a piece as sold.
- **Cart tab** (admin) — quantity steppers, subtotal, remove, and any
  applied/overridden deals shown under the list.
- **Deals engine** (`src/lib/deals.ts`) — auto-applies active deals from the
  `deals` table against the cart, per the design doc's rules: non-stackable
  deals competing over the same `applies_to` scope keep only the biggest
  discount (others shown greyed-out/struck-through as "overridden"), stackable
  deals always combine on top. Supports all 4 deal types (`bundle_price`,
  `percent_off`, `amount_off`, `bogo`) and quantity/series/type/SKU scoping.
  **Not supported**: the doc's "1 print + 1 original from same series"
  mixed-type combo trigger, and the optional "1 item away from unlocking a
  deal" upsell prompt — both explicitly scoped out as follow-ups, not bugs.
- **Deals tab** (admin) — add/edit/delete deals from the app (`DealsScreen.tsx` +
  `DealFormScreen.tsx`), no need to touch Supabase directly. A structured
  form, not raw JSON — pick deal type, trigger count, discount, scope
  (all/by-type/by-SKU-list), stackable, active, optional date window. Toggle
  a deal on/off right from the list without opening the form. "By series"
  scope isn't in the form yet since no piece currently has a `series` set —
  add it once Chrissy's catalog actually uses that field.
  3 example deals are in `supabase/seed_deals.sql` (not yet run — see
  checklist) purely to exercise it, not Chrissy's real picks.
- **Checkout** (modal from Cart) — pick Venmo/PayPal/cash (Square shown but
  disabled until the SDK's wired in), optional tip, deal discount, fee
  estimate, "Confirm Paid" → decrements inventory (marks sold when a piece
  hits 0 remaining), apportions each item's deal discount and fee into its
  per-unit `sale_price`/`fee_amount`, and logs a sale row per unit — all
  written to Supabase.
- `src/context/PiecesContext.tsx`, `SalesContext.tsx`, `DealsContext.tsx` —
  read/write Supabase directly. `CartContext.tsx` stays in-memory on purpose
  (the cart is a transient, per-session thing, not data to persist).
- `src/lib/fees.ts` — per-method fee estimate (Square/Venmo/PayPal/cash rates
  from the design doc). Fee currently reduces Chrissy's net rather than being
  passed to the buyer — an open business decision, easy to flip in `CheckoutScreen.tsx`.
- `supabase/migrations/0001_init.sql` — `pieces` / `sales` / `deals` tables + RLS.
- `supabase/seed.sql` — real inventory as INSERT statements, generated from `seedPieces.ts`.
- **Type-safety note**: `Piece`/`Sale`/`Deal`/`Database` in `src/types/database.ts`
  are `type` aliases, not `interface`s — deliberately. TypeScript's structural
  check against `Record<string, unknown>` (which supabase-js's generics rely
  on) requires an explicit index signature for interfaces but not type
  aliases; using interfaces silently collapsed every `.insert()`/`.update()`
  argument type to `never`. Keep this in mind if regenerating this file from
  the Supabase CLI (it emits interfaces).

## Not started yet

Square card payments, barcode scanning, reports, offline queueing,
refund/void. See "Open / Next Steps" in `chrissy-art-inventory-app.md`.

Barcode scanning (`react-native-vision-camera`) and the Square SDK both need a
physical device to test — the simulator can't do Bluetooth or camera. Tap-to-add
from the Inventory list stands in for scanning until then.
