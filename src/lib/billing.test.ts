// Unit tests for subscriptionRowFromStripe (supabase/functions/_shared/billing.ts),
// which turns a Stripe Subscription into the store_subscriptions columns the
// billing webhook writes. Pure function: nothing is read from or written to
// Stripe or the database.
import { subscriptionRowFromStripe, type StripeSubscriptionFields } from '../../supabase/functions/_shared/billing';

// 2026-10-20T00:00:00Z and 2026-11-03T00:00:00Z, as Stripe's Unix seconds.
const OCT_20 = 1792454400;
const NOV_03 = 1793664000;

function subscription(overrides: Partial<StripeSubscriptionFields>): StripeSubscriptionFields {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    trial_end: null,
    current_period_end: NOV_03,
    cancel_at_period_end: false,
    items: { data: [{ price: { recurring: { interval: 'month' } } }] },
    ...overrides,
  };
}

describe('subscriptionRowFromStripe', () => {
  test('maps a trialing subscription, with its trial end as an ISO timestamp', () => {
    expect(subscriptionRowFromStripe(subscription({ status: 'trialing', trial_end: NOV_03 }))).toEqual({
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      status: 'trialing',
      price_interval: 'month',
      trial_end: '2026-11-03T00:00:00.000Z',
      current_period_end: '2026-11-03T00:00:00.000Z',
      cancel_at_period_end: false,
    });
  });

  test('maps an active yearly subscription with no trial', () => {
    const row = subscriptionRowFromStripe(
      subscription({ items: { data: [{ price: { recurring: { interval: 'year' } } }] } })
    );
    expect(row.status).toBe('active');
    expect(row.price_interval).toBe('year');
    expect(row.trial_end).toBeNull();
  });

  test('keeps past_due as its own status, for the database to treat as paid', () => {
    expect(subscriptionRowFromStripe(subscription({ status: 'past_due' })).status).toBe('past_due');
  });

  test('maps a canceled subscription', () => {
    const row = subscriptionRowFromStripe(subscription({ status: 'canceled', current_period_end: OCT_20 }));
    expect(row.status).toBe('canceled');
    expect(row.current_period_end).toBe('2026-10-20T00:00:00.000Z');
  });

  test('carries cancel_at_period_end through while the subscription is still active', () => {
    const row = subscriptionRowFromStripe(subscription({ cancel_at_period_end: true }));
    expect(row.status).toBe('active');
    expect(row.cancel_at_period_end).toBe(true);
  });

  test('takes the customer id from an expanded customer object', () => {
    expect(subscriptionRowFromStripe(subscription({ customer: { id: 'cus_456' } })).stripe_customer_id).toBe('cus_456');
  });

  test('leaves price_interval null when the subscription has no recurring price', () => {
    expect(subscriptionRowFromStripe(subscription({ items: { data: [] } })).price_interval).toBeNull();
  });

  test('never sets comped, which only Melissa sets by hand', () => {
    expect(subscriptionRowFromStripe(subscription({}))).not.toHaveProperty('comped');
  });
});
