-- Records which version of the Terms of Service each store has accepted, so
-- a change to the terms (version 2 adds the platform fee) can ask every
-- vendor to accept again. terms_accepted_at (0018) only says *when*; this
-- says *what*.
--
-- Existing rows stay null on purpose: every existing vendor sees the
-- accept screen once (App.tsx, src/lib/terms.ts), and stripe-create-checkout
-- refuses card and Cash App sales until they accept. The demo store is
-- skipped in the app, since its user can't write its own row (0020).
--
-- The column is vendor-writable through the existing "owner update own
-- store" policy (0002). That's acceptable: the vendor is the one consenting,
-- and the column can't lower anyone's fee.
--
-- Run this once in the Supabase SQL editor BEFORE deploying the web app or
-- merging: the app's accept screen writes this column, and
-- scripts/seed-demo.js (run nightly from master) inserts it.

alter table stores add column terms_version_accepted integer;
