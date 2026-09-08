# Chrissy's Studio — Checkout & Inventory App

Native iOS app (Expo/React Native) for Four Seasons Studio: barcode-scan
inventory, cart, and checkout via Square reader / manual Venmo-PayPal-cash.

Design doc / schema / decisions: [`chrissy-art-inventory-app.md`](./chrissy-art-inventory-app.md).

## Status

Inventory + Cart + manual-payment Checkout are working end-to-end against real
inventory data. Square card payments and barcode scanning aren't wired up yet
— both need a physical device and are blocked on accounts (see checklist).

## Stack

- Expo (React Native + TypeScript) — chosen over bare RN so iOS builds can run
  on Expo's cloud Mac fleet (EAS Build); no local Mac needed on this Windows machine.
- Supabase (Postgres) — `supabase/migrations/0001_init.sql` has the `pieces` /
  `sales` / `deals` tables. Not connected yet; the app currently runs on the
  data in `src/data/seedPieces.ts` (see below).
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
- [ ] **Supabase project** (supabase.com) — new project, then run, in order:
      `supabase/migrations/0001_init.sql` then `supabase/seed.sql` in its SQL
      editor. Copy `.env.example` to `.env` and fill in the project URL + anon
      key.
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

**Once those exist:**

- [ ] `npm install -g eas-cli` + `eas login`, then `eas build:configure` to set
      up a development build (needed the moment we add the Square SDK or
      vision-camera, since those are native modules Expo Go can't run).
- [ ] Regenerate `src/types/database.ts` from the real schema:
      `npx supabase gen types typescript --project-id <id> > src/types/database.ts`
- [ ] Point `PiecesContext` at Supabase instead of `seedPieces.ts`, and have
      `SalesContext` write through to the `sales` table instead of holding
      sales in memory.

## What's already here

- **Inventory tab** — real catalog (128 items: originals + their print/sticker/pin/
  postcard variants), sold items shown but disabled. Pin ($3) and postcard ($5)
  pricing comes from Chrissy's spreadsheet's "2026 Calculations" sheet; most of
  their stock counts are real (the sheet's column was unambiguous for them even
  where prints/stickers weren't) — a few postcard rows still fall back to the
  same placeholder as prints, flagged in `seedPieces.ts`.
- **Cart tab** — quantity steppers, subtotal, remove.
- **Checkout** (modal from Cart) — pick Venmo/PayPal/cash (Square shown but
  disabled until the SDK's wired in), optional tip, fee estimate, "Confirm
  Paid" → decrements inventory (marks sold when a piece hits 0 remaining) and
  logs a sale per unit.
- `src/context/PiecesContext.tsx`, `CartContext.tsx`, `SalesContext.tsx` — all
  in-memory for now; no persistence between app restarts until Supabase is wired in.
- `src/lib/fees.ts` — per-method fee estimate (Square/Venmo/PayPal/cash rates
  from the design doc). Fee currently reduces Chrissy's net rather than being
  passed to the buyer — an open business decision, easy to flip in `CheckoutScreen.tsx`.
- `src/lib/supabase.ts` + `src/types/database.ts` — Supabase client/types, unused until the project exists.
- `supabase/migrations/0001_init.sql` — `pieces` / `sales` / `deals` tables + RLS.
- `supabase/seed.sql` — real inventory as INSERT statements, generated from `seedPieces.ts`.

## Not started yet

Square card payments, barcode scanning, the deals/bundle engine, reports,
offline queueing, refund/void. See "Open / Next Steps" in
`chrissy-art-inventory-app.md`.

Barcode scanning (`react-native-vision-camera`) and the Square SDK both need a
physical device to test — the simulator can't do Bluetooth or camera. Tap-to-add
from the Inventory list stands in for scanning until then.
