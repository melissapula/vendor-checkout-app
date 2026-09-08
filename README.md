# Chrissy's Studio — Checkout & Inventory App

Native iOS app (Expo/React Native) for Four Seasons Studio: barcode-scan
inventory, cart, and checkout via Square reader / manual Venmo-PayPal-cash.

Design doc / schema / decisions: [`chrissy-art-inventory-app.md`](./chrissy-art-inventory-app.md).

## Status

Scaffolded, not yet building features. See "Setup checklist" below for what's
blocking real development.

## Stack

- Expo (React Native + TypeScript) — chosen over bare RN so iOS builds can run
  on Expo's cloud Mac fleet (EAS Build); no local Mac needed on this Windows machine.
- Supabase (Postgres) — `supabase/migrations/0001_init.sql` has the `pieces` /
  `sales` / `deals` tables.
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
- [ ] **Supabase project** (supabase.com) — new project, then run
      `supabase/migrations/0001_init.sql` in its SQL editor. Copy `.env.example`
      to `.env` and fill in the project URL + anon key.

**Once those exist:**

- [ ] `npm install -g eas-cli` + `eas login`, then `eas build:configure` to set
      up a development build (needed the moment we add the Square SDK or
      vision-camera, since those are native modules Expo Go can't run).
- [ ] Regenerate `src/types/database.ts` from the real schema:
      `npx supabase gen types typescript --project-id <id> > src/types/database.ts`

## What's already here

- `src/lib/supabase.ts` — Supabase client (reads `EXPO_PUBLIC_SUPABASE_*` env vars)
- `src/types/database.ts` — hand-written types matching the migration, to swap
  for generated ones once the Supabase project exists
- `supabase/migrations/0001_init.sql` — `pieces` / `sales` / `deals` tables + RLS

## Not started yet

Everything feature-facing: cart/scan screen, checkout flow (Square + manual
Venmo/PayPal/cash), deals engine, reports, offline queueing. See the "Open /
Next Steps" list at the bottom of `chrissy-art-inventory-app.md`.

Barcode scanning (`react-native-vision-camera`) and the Square SDK both need a
physical device to test — the simulator can't do Bluetooth or camera. Fine to
build screens/logic against mock data now; real end-to-end testing waits for
the iPad + reader.
