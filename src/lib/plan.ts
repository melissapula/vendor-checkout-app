import type { PaymentMethod, PlanState } from '../types/database';

// The payment methods only a store on the paid plan may take. Keep in step
// with supabase/functions/_shared/plan.ts; plan.test.ts fails if the two
// differ.
export const PAID_ONLY_PAYMENT_METHODS: PaymentMethod[] = ['card', 'cash_app'];

// Features the free plan doesn't include (besides card and Cash App Pay).
export const PAID_FEATURES = [
  'deals',
  'events',
  'savedReports',
  'charts',
  'adjustments',
  'printLabels',
  'importOrder',
] as const;
export type PaidFeature = (typeof PAID_FEATURES)[number];

// PostgREST's code for "no such function": get_plan_state() before
// migration 0025 is applied.
const FUNCTION_NOT_FOUND = 'PGRST202';

type RpcResult = { data: PlanState | null; error: { code?: string; message: string } | null };

// Turns the get_plan_state() response into what AuthContext keeps. A missing
// function means plans don't exist yet, so it is no plan state and no error,
// letting the web app deploy before the migration runs.
export function planStateFromRpc({ data, error }: RpcResult): { planState: PlanState | null; planError: string | null } {
  if (!error) return { planState: data, planError: null };
  if (error.code === FUNCTION_NOT_FOUND) return { planState: null, planError: null };
  return { planState: null, planError: error.message };
}

// The store's saved payment methods minus the paid-only ones when plans are
// on and the store is free. Filters for display only, never rewrites the
// saved list, so re-subscribing brings the vendor's choices back. No plan
// state (still loading, or migration 0025 not applied yet) counts as "not
// enforced": stripe-create-checkout is the gate that matters.
export function visiblePaymentMethods(enabled: PaymentMethod[], planState: PlanState | null): PaymentMethod[] {
  if (!planState || !planState.plans_enforced || planState.is_paid) return enabled;
  return enabled.filter((method) => !PAID_ONLY_PAYMENT_METHODS.includes(method));
}
