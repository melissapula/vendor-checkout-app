# Checkout & Inventory App

Expo/React Native app, originally built for Chrissy's Four Seasons Studio and
since opened up as a multi-tenant app any independent art/craft vendor can
sign up for: barcode-scan inventory, cart, and checkout via manual
Venmo-PayPal-cash. See "Multi-tenant" below for how stores are isolated from
each other.

**Distribution: web app, not the App Store.** Deployed as a static web build
and used via each vendor's browser "Add to Home Screen" (full-screen, no
browser chrome, no Apple Developer Program enrollment needed). This was a
deliberate choice over a native build — see "Web distribution" below for what
that trades away.

Design doc / schema / decisions: [`chrissy-art-inventory-app.md`](./chrissy-art-inventory-app.md).

## Status

Inventory + Cart + manual-payment Checkout + the deals engine are working
end-to-end against a live Supabase project with real inventory data, both as
the native app (Expo Go) and as a web build (see "Web distribution" below).
Square card payments and barcode scanning are permanently out of scope now
that distribution is web-only — see "Web distribution" for why.

The app opens on a **Customer view** by default; a "Staff Access" PIN unlocks
**Admin** (Inventory/pricing/stock, Cart/Checkout, Deals). See "Admin vs.
Customer" below.

## Stack

- Expo (React Native + TypeScript) — originally chosen so iOS builds could run
  on Expo's cloud Mac fleet (EAS Build) with no local Mac needed; now doubling
  as the web build tooling too (`react-native-web`), since distribution is
  web-first (see "Web distribution" below).
- Supabase (Postgres), project `majsosgcgydpgelkpdpj` — live. `pieces`, `sales`,
  and `deals` are all real tables the app reads/writes; nothing's in-memory-only
  anymore except the cart itself (which should be ephemeral).

## Web distribution

**Live at https://vendor-checkout-app.expo.app** — hosted on EAS Hosting's
free tier (owner account: `mfpstudio` on expo.dev; project id in `app.json`'s
`extra.eas.projectId`). Free tier means no custom domain (fine here — vendors
tap a home-screen icon, never type the URL) and 100k requests/month, far more
than this needs.

Note: an earlier deployment briefly lived at
`https://chrissys-studio-checkout.expo.app`, under a separate now-unused EAS
project (`chrissys-studio-checkout`, same `mfpstudio` account) — a project
slug can't be renamed on Expo's side once created, so switching the app's
name to something vendor-neutral meant creating a fresh project rather than
renaming the old one. That old project was never linked from anywhere real
(no vendor onboarded during the window it was live), so nothing depends on
it; it's just an unused leftover, safe to delete from the expo.dev dashboard
whenever, not currently linked from `app.json`.

Built with `npx expo export --platform web` (outputs static files to `dist/`)
and deployed with `eas deploy --prod` (or `npm run deploy:web`, which does
both in one step) — a plain static site, no server, no SSR. Vendors "install"
it via their browser's "Add to Home Screen" (iOS Safari) / "Install app"
(Android Chrome), which reads `public/index.html`'s meta tags and
`public/manifest.json` to launch full-screen with no browser chrome.
`eas deploy` (without `--prod`) publishes a throwaway preview URL instead of
updating the live site — useful for checking a change before it goes out to
everyone, but easy to forget the `--prod` flag and wonder why nothing changed.

**What this trades away**, permanently, not just "for now": no App Store
listing/discoverability, and — the bigger one — no Square Bluetooth
card-reader SDK (`mobile-payments-sdk-react-native` is a native module; it
cannot run in a browser at all, on any platform). Checkout stays
manual-payment-only (Venmo/PayPal/cash) unless this becomes a native build
later. Worth knowing this was a deliberate tradeoff, not an oversight, before
building further on top of it.

`public/index.html` and `public/manifest.json` are hand-written (Expo's web
export doesn't auto-generate PWA manifest/meta tags from `app.json` the way
older Expo web tooling did) — edit those directly for icon/theme-color/name
changes, not `app.json`'s `web` key. `public/icon-512.png` is currently just
Expo's stock placeholder icon (the default `create-expo-app` template art,
not anything Chrissy-specific) — swap it for a real icon whenever one exists.
The browser tab title / suggested home-screen name updates at runtime to the
signed-in vendor's own store name (see `App.tsx`); the static default in
`public/index.html` ("Studio Checkout") is only what shows before sign-in.

## Setup checklist

**Blocking — only you can do these:**

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

**Housekeeping:**

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
- **Admin** (`AdminScreen.tsx`) — Inventory/Cart/Deals, switched via a
  dropdown menu from the header (tap the title) rather than a tab bar; the
  same menu's last item is "Customer View" to exit back out. Reached by
  tapping "Staff Access" and entering the PIN. This is plain local state, not
  a navigator — no screen needs back-stack/deep-linking, so `@react-navigation/*`
  and `react-native-screens` were removed as dependencies (dropped the bundle
  from 2.6MB to 2.2MB, 1000+ modules to 659).

**The PIN is per-store now** — set when a store owner first signs up
(`CreateStoreScreen.tsx`) and editable anytime from Admin → Settings
(`StoreSettingsScreen.tsx`), stored as `stores.admin_pin`. This is a
deterrent, not real security: it's meant to stop a customer from casually
poking at pricing/inventory/deals while the iPad's in their hands, not to
protect real secrets or isolate one store's data from another's — that
isolation is Supabase Auth + RLS's job (see "Multi-tenant" below), not the PIN's.

## Multi-tenant

Originally single-tenant (all data was implicitly Chrissy's). Now every
business signs up with email/password (Supabase Auth — no email confirmation
step, so access is immediate) and gets one `stores` row tied to their
`auth.users` id. `pieces`/`sales`/`deals` all carry a `store_id`,
stamped server-side by a Postgres trigger on every insert/update (so a client
can't spoof another store's id even by accident) and enforced by RLS scoped
to `store_id = the caller's own store`. See `supabase/migrations/
0002_stores_and_tenant_columns.sql` and `0003_enforce_tenant_isolation.sql`,
and `supabase/backfill_existing_data.sql` for the one-time cutover of
Chrissy's pre-existing data into her own store.

The device itself stays signed in as its owner (kiosk usage — customers never
get their own login); the `AuthContext` → `AppGate` in `App.tsx` sits above
the whole existing Customer/PIN/Admin mode machine, which is otherwise
unchanged. A brand-new store starts with an empty catalog — added through the
existing Admin Inventory CRUD, same as before.

**Forgot-password recovery**: code-based, not a magic link — `ResetPasswordScreen.tsx`
has the user request a reset, receive a 6-digit code by email, then enter the
code + a new password in-app (`AuthContext.requestPasswordReset` /
`confirmPasswordReset`, wrapping `supabase.auth.resetPasswordForEmail` and
`verifyOtp({ type: 'recovery' })`). Chosen over a deep-linked reset URL to
avoid needing a custom URL scheme/universal links for a mobile app — works
identically in Expo Go and any future standalone build. **Requires** editing
the Supabase project's "Reset Password" email template to actually display
`{{ .Token }}` (the stock template only shows a clickable link, not the code).

Deferred (not in scope yet): per-store fee rates (`src/lib/fees.ts` is still
one global rate table for everyone), multi-staff accounts per store, store
deletion/data export, in-app billing (subscriptions are handled outside the
app, e.g. Stripe/invoice).

## Barcode labels

Each piece's `sku` is encoded as a Code128 barcode (`jsbarcode`) and can be
printed — either one at a time ("Print label" on an Inventory row) or in
bulk ("Print Labels" in the footer, which queues every non-sold piece).
Code128 rather than QR: it's what cheap USB/Bluetooth barcode scanners (the
kind that plug in and act like a keyboard — scan an item, its SKU gets typed
wherever the cursor has focus, no camera or native code needed) expect,
matching how small-business inventory tagging usually works. This is a
**web-only** approach, not a compatibility shim: it needs no camera/native
module at all, which fits the app's web-only distribution (see "Web
distribution" above) rather than working around it.

**Printed to match Avery 5160** (1in x 2.625in, 30/sheet, 3 cols x 10 rows,
0.5in top/bottom margin, 0.1875in side margin, 0.125in gap between columns,
no vertical gap — verified against Avery's own published spec, not guessed).
Pieces beyond 30 automatically continue onto additional sheets
(`page-break-after` per sheet). If a vendor uses a different label
product, the dimensions are named constants at the top of
`src/components/PrintLabelsOverlay.tsx` (`LABEL_WIDTH_IN`, `MARGIN_TOP_IN`,
etc.) — change those to match, they're not scattered magic numbers.

How it works: the barcode itself is a `<canvas>` rendered off-screen and
converted to a PNG data URL (`src/lib/barcode.ts`, `renderBarcodeDataUrl`),
shown at an explicit physical size (`width: '2.2in', height: 'auto'`) so it
scales correctly for print regardless of the source canvas's raw pixel
dimensions. The label/sheet grid itself is raw DOM (`<div>` with
`display: 'grid'` and `in`-unit `gridTemplateColumns`/`gridTemplateRows`),
not React Native's `StyleSheet` — RN's style system has no grid or absolute
physical-unit support, and this subtree only ever renders on web anyway, so
there's no cross-platform reason to route it through RN's abstraction.
Printing uses a React portal (`react-dom`'s `createPortal`) into a `<div>`
appended to `<body>`, sitting outside `#root` — injected print-only CSS
(including `@page { size: letter; margin: 0 }`, needed so the browser's own
default print margins don't stack with the sheet's own 0.5in/0.1875in
margins) hides the whole app and shows just that portal for the duration of
`window.print()`, then an `afterprint` listener clears the queue and the
app's normal UI reappears.

## Barcode scanning

Two ways to add an item to the cart by its barcode, both in `CartScreen.tsx`
via the shared `useScanToCart` hook (`src/lib/scanToCart.ts` — looks a piece
up by `sku`, checks it's sellable, calls `CartContext.addItem`; shared so
both entry points have identical add/error logic):

- **USB/Bluetooth scanner** — a visible "Scan or type a SKU, then Enter"
  field. These scanners act as a keyboard: scanning a label types its SKU
  into whatever has focus and sends Enter. Tap into the field once, then
  scanning (or manual typing, as a fallback) adds the item on Enter. No
  camera permission, no extra library — it's just a text input.
- **Phone camera** — a "Scan with camera" button opens a live camera view
  (`src/components/CameraScanner.tsx`, `@zxing/browser` +
  `@zxing/library`, restricted to `CODE_128` to match what this app
  prints) and adds items continuously as they're recognized. A 2-second
  per-code cooldown (`RESCAN_COOLDOWN_MS`) stops one label held in frame
  from being decoded — and added — dozens of times a second; without it,
  every recognized video frame fires the callback again. `BrowserMultiFormatReader`'s
  `onScan` callback is read through a ref rather than a direct dependency of
  its effect, specifically so a parent whose callback identity changes on
  every successful scan (this one does, since it closes over cart state)
  doesn't restart the camera stream — and flicker the video — after every
  single item scanned.

Not yet verified against a real device/camera in this environment (no
physical camera available where this was built) — the keyboard-wedge path
was verified end-to-end (typed input → correct item added, unknown SKU →
correct error message); the camera path was only confirmed to open cleanly
and request camera access without crashing. Worth an real-device test before
relying on it for a live show.

## What's already here

- **Inventory page** (admin) — real catalog (128 items: originals + their
  print/sticker/pin/postcard variants), sold items shown but disabled. Pin
  ($3) and postcard ($5) pricing comes from Chrissy's spreadsheet's "2026
  Calculations" sheet; most of their stock counts are real (the sheet's
  column was unambiguous for them even where prints/stickers weren't) — a few
  postcard rows still fall back to the same placeholder as prints, flagged in
  `seedPieces.ts`. Full add/edit/delete (`PieceFormScreen.tsx`) — title, SKU,
  type (chips for known types + a free-text "other"), medium, price,
  quantity, status, linked original (search-to-select, for print/sticker/
  pin/postcard variants), series, dimensions, cost basis, image URL, notes.
  "+ Add Piece" in the footer for a brand-new item (auto-suggests the next
  `SKU-####`); "+ Add variant" on any original pre-fills the link back to
  it. SKUs are unique per store, not globally, so two stores can each have
  their own `SKU-0001`. Deleting a piece that other pieces reference as their `original_id` is
  blocked client-side with a clear message rather than a raw FK error — the
  DB has no cascade delete set up. Editing quantity back above 0 un-marks a
  piece as sold. This is how to fix the placeholder stock counts once
  Chrissy has real numbers — no SQL needed. Each row also has a **"Print
  label"** link, and there's a bulk **"Print Labels"** button in the footer
  (all non-sold pieces at once) — see "Barcode labels" below.
- **Cart page** (admin) — quantity steppers, subtotal, remove, and any
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
- **Deals page** (admin) — add/edit/delete deals from the app (`DealsScreen.tsx` +
  `DealFormScreen.tsx`), no need to touch Supabase directly. A structured
  form, not raw JSON — pick deal type, trigger count, discount, scope
  (all/by-type/by-SKU-list), stackable, active, optional date window. Toggle
  a deal on/off right from the list without opening the form. "By series"
  scope isn't in the form yet since no piece currently has a `series` set —
  add it once Chrissy's catalog actually uses that field.
  3 example deals are in `supabase/seed_deals.sql` (not yet run — see
  checklist) purely to exercise it, not Chrissy's real picks.
- **Checkout** (modal from Cart) — optional "show/venue" name (persists across
  checkouts for the session via `CartContext`, so it's not retyped every
  sale), pick Venmo/PayPal/cash (Square shown but disabled until the SDK's
  wired in), optional tip, deal discount, fee estimate, "Confirm Paid" →
  decrements inventory (marks sold when a piece hits 0 remaining), apportions
  each item's deal discount and fee into its per-unit `sale_price`/
  `fee_amount`, and logs a sale row per unit — all written to Supabase.
- **Reports page** (admin, `ReportsScreen.tsx`) — filter sales by date range
  (today/last 7 days/all time/custom, with a local-timezone-safe custom
  range — see note below), payment method, item type, and show/venue (the
  venue filter only appears once at least one sale has one recorded); summary
  totals (items sold, gross, tips, fees, net) and a by-type breakdown, plus
  the individual matching sales. Pulls from the real `sales` table — no more
  in-memory-only sales history (see `SalesContext` note below).
- `src/context/PiecesContext.tsx`, `SalesContext.tsx`, `DealsContext.tsx` —
  read/write Supabase directly. `CartContext.tsx` stays in-memory on purpose
  (the cart is a transient, per-session thing, not data to persist) — it also
  now holds the current show/venue name for Checkout, for the same reason.
  **Fixed while building Reports**: `SalesContext` never actually loaded
  existing sales from Supabase on startup — it only accumulated sales made
  during the current session, so every app reload silently dropped sales
  history from view (the rows were still safely in the database, just not
  visible in the app). Now fetches on mount like the other contexts.
- `src/lib/fees.ts` — per-method fee estimate (Square/Venmo/PayPal/cash rates
  from the design doc), one global rate table shared by every store for now
  (see "Multi-tenant" above). Fee currently reduces the seller's net rather
  than being passed to the buyer — an open business decision, easy to flip in
  `CheckoutScreen.tsx`.
- `supabase/migrations/0001_init.sql` — original single-tenant `pieces` /
  `sales` / `deals` tables + RLS; `0002_stores_and_tenant_columns.sql` /
  `0003_enforce_tenant_isolation.sql` layer multi-tenancy on top (see
  "Multi-tenant" above).
- `supabase/seed.sql` / `src/data/seedPieces.ts` — Chrissy's real inventory as
  a one-time seed for her specific store during the multi-tenant cutover;
  **not** bundled/run for new stores, which start empty. Kept for historical
  reference.
- **Type-safety note**: `Piece`/`Sale`/`Deal`/`Database` in `src/types/database.ts`
  are `type` aliases, not `interface`s — deliberately. TypeScript's structural
  check against `Record<string, unknown>` (which supabase-js's generics rely
  on) requires an explicit index signature for interfaces but not type
  aliases; using interfaces silently collapsed every `.insert()`/`.update()`
  argument type to `never`. Keep this in mind if regenerating this file from
  the Supabase CLI (it emits interfaces).
- **Date-range note**: `ReportsScreen.tsx`'s custom date filter parses
  `YYYY-MM-DD` input via an explicit `(year, month, day)` constructor, not
  `new Date('YYYY-MM-DD')`. That form parses as UTC midnight, and mixing it
  with `.setHours()` (which mutates in local time) silently shifts the "To"
  boundary by Chrissy's UTC offset — in US time zones that cuts a report off
  several hours before real end-of-day, hiding actual sales. Caught by a
  standalone test before it shipped; keep using the explicit constructor for
  any future date-only parsing in this app.

## Not started yet

Offline queueing, refund/void. See "Open / Next Steps" in
`chrissy-art-inventory-app.md`.

Square card payments and barcode scanning (`react-native-vision-camera`) are
**not planned** — both are native-only modules, permanently ruled out by the
web-distribution decision (see "Web distribution" above), not just "not built
yet." Tap-to-add from the Inventory list stands in for scanning.
