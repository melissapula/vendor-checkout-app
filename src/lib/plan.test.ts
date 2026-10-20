// Unit tests for the subscription plan helpers (plan.ts). Pure functions:
// nothing is read from or written to the database.
import { PAID_ONLY_PAYMENT_METHODS, planStateFromRpc, visiblePaymentMethods } from './plan';
import { PAID_ONLY_PAYMENT_METHODS as SERVER_PAID_ONLY_PAYMENT_METHODS } from '../../supabase/functions/_shared/plan';
import type { PaymentMethod, PlanState } from '../types/database';

const ALL_METHODS: PaymentMethod[] = ['cash', 'card', 'venmo', 'cash_app', 'paypal'];

function planState(overrides: Partial<PlanState>): PlanState {
  return {
    plans_enforced: true,
    is_paid: false,
    status: null,
    trial_end: null,
    current_period_end: null,
    cancel_at_period_end: false,
    has_subscribed_before: false,
    ...overrides,
  };
}

describe('visiblePaymentMethods', () => {
  test('shows every saved method while plans are not enforced', () => {
    expect(visiblePaymentMethods(ALL_METHODS, planState({ plans_enforced: false }))).toEqual(ALL_METHODS);
  });

  test('shows every saved method to a paid store', () => {
    expect(visiblePaymentMethods(ALL_METHODS, planState({ is_paid: true }))).toEqual(ALL_METHODS);
  });

  test('hides card and Cash App Pay from a free store, keeping the order of the rest', () => {
    expect(visiblePaymentMethods(ALL_METHODS, planState({ is_paid: false }))).toEqual(['cash', 'venmo', 'paypal']);
  });

  // No plan state yet (still loading, or migration 0025 not applied) is
  // treated as "not enforced"; stripe-create-checkout is the real gate.
  test('shows every saved method when there is no plan state', () => {
    expect(visiblePaymentMethods(ALL_METHODS, null)).toEqual(ALL_METHODS);
  });
});

describe('planStateFromRpc', () => {
  test('passes the plan state through on success', () => {
    const state = planState({ is_paid: true });
    expect(planStateFromRpc({ data: state, error: null })).toEqual({ planState: state, planError: null });
  });

  // Before migration 0025 is applied the function doesn't exist; that must
  // not show the vendor an error.
  test('treats a missing get_plan_state function as no plan state and no error', () => {
    const missing = { code: 'PGRST202', message: 'Could not find the function public.get_plan_state' };
    expect(planStateFromRpc({ data: null, error: missing })).toEqual({ planState: null, planError: null });
  });

  test('reports any other failure', () => {
    const failed = { code: '500', message: 'Failed to fetch' };
    expect(planStateFromRpc({ data: null, error: failed })).toEqual({ planState: null, planError: 'Failed to fetch' });
  });
});

test('the app and the Edge Functions agree on the paid-only methods', () => {
  expect(PAID_ONLY_PAYMENT_METHODS).toEqual(['card', 'cash_app']);
  expect(SERVER_PAID_ONLY_PAYMENT_METHODS).toEqual(PAID_ONLY_PAYMENT_METHODS);
});
