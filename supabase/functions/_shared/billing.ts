// Turns a Stripe Subscription (the platform's own Stripe Billing, not a
// vendor's connected account) into the store_subscriptions columns from
// migration 0025. Used by stripe-billing-webhook.
//
// current_period_end is read from the Subscription itself: npm:stripe@17
// pins API version 2025-02-24.acacia, where it still lives there. Later
// versions (2025-03-31.basil on) move it to each subscription item, so
// bumping the stripe import past v17 means changing this.
//
// comped is deliberately not here: only Melissa sets it, by hand, and the
// webhook must never overwrite it.
//
// Kept free of Deno/npm imports so the Jest unit test in
// src/lib/billing.test.ts can import it.

// The parts of Stripe.Subscription this reads, so the test needs no Stripe
// types. A real Stripe.Subscription satisfies it.
export interface StripeSubscriptionFields {
  id: string;
  customer: string | { id: string };
  status: string;
  trial_end: number | null;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: { data: { price: { recurring: { interval: string } | null } }[] };
}

export interface SubscriptionRow {
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: string;
  price_interval: string | null;
  trial_end: string | null;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

// Stripe sends Unix seconds; the columns are timestamptz.
const toIso = (seconds: number): string => new Date(seconds * 1000).toISOString();

export function subscriptionRowFromStripe(sub: StripeSubscriptionFields): SubscriptionRow {
  return {
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    status: sub.status,
    price_interval: sub.items.data[0]?.price.recurring?.interval ?? null,
    trial_end: sub.trial_end === null ? null : toIso(sub.trial_end),
    current_period_end: toIso(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}
