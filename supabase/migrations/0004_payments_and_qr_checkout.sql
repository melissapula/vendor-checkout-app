-- Configurable checkout payment methods, per-store fee-passthrough choice,
-- and Stripe Connect for real card processing (via a QR-code-to-buyer's-own-
-- phone hosted checkout, not a physical reader or Tap to Pay — see the plan
-- doc / README for why). Venmo/PayPal/Cash App stay self-reported, just with
-- a scannable amount-prefilled deep-link QR instead of manual entry.

alter table stores add column enabled_payment_methods text[] not null default '{venmo,paypal,cash}';
alter table stores add constraint stores_enabled_payment_methods_check
  check (enabled_payment_methods <@ array['card','venmo','paypal','cash_app','cash']::text[]);

alter table stores add column pass_fee_to_buyer boolean not null default false;

-- Stripe Connect (card only — Venmo/PayPal/Cash App need no account linkage,
-- their deep links just use a public handle).
alter table stores add column stripe_account_id text unique;
alter table stores add column stripe_onboarding_complete boolean not null default false;

-- Defense in depth: 'card' can't be enabled without a completed Stripe
-- connection, even if a future code path forgets the client-side guard in
-- PaymentSettingsScreen.
alter table stores add constraint stores_card_requires_stripe_check
  check (not ('card' = any(enabled_payment_methods)) or stripe_onboarding_complete);

-- Deep-link handles for the self-reported QR methods. Not secrets — these
-- are the same handles a vendor already hands out publicly — so plain
-- columns, editable directly via updateStore, no Edge Function needed.
alter table stores add column venmo_username text;
alter table stores add column paypal_me_username text;
alter table stores add column cash_app_cashtag text;

-- 'square' was a UI placeholder for an abandoned integration and was never
-- actually wired up — this update is a defensive no-op, not an assumption.
update sales set payment_method = 'card' where payment_method = 'square';

alter table sales drop constraint sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in ('card', 'venmo', 'paypal', 'cash_app', 'cash'));

-- Always null today (Square never shipped) — rename in place rather than
-- add+drop, so it keeps working as "the processor's payment id" (now a
-- Stripe Checkout Session/PaymentIntent id) going forward.
alter table sales rename column square_payment_id to processor_payment_id;
