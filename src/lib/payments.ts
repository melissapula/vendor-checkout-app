import { supabase } from './supabase';

// Thin wrappers over the Stripe Edge Functions (supabase/functions/stripe-*)
// — one call each, throw on error, matching the style of deals.ts/fees.ts.
// supabase.functions.invoke() forwards the current session's Authorization
// header automatically, which is what lets each function run as (and only
// see data for) the calling store — see supabase/functions/_shared/store.ts.

export async function startStripeOnboarding(returnUrl: string, refreshUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('stripe-connect-onboarding', {
    body: { returnUrl, refreshUrl },
  });
  if (error) throw error;
  return data!.url;
}

export interface StripeAccountStatus {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted?: boolean;
  requirementsDue?: string[];
}

export async function checkStripeAccountStatus(): Promise<StripeAccountStatus> {
  const { data, error } = await supabase.functions.invoke<StripeAccountStatus>('stripe-account-status', {
    body: {},
  });
  if (error) throw error;
  return data!;
}

export async function createStripeCheckout(
  amountCents: number,
  idempotencyKey: string,
  paymentMethodType: 'card' | 'cashapp'
): Promise<{ url: string; sessionId: string }> {
  const { data, error } = await supabase.functions.invoke<{ url: string; sessionId: string }>(
    'stripe-create-checkout',
    { body: { amountCents, idempotencyKey, paymentMethodType } }
  );
  if (error) throw error;
  return data!;
}

export interface StripeCheckoutStatus {
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentIntentId: string | null;
  feeAmountCents: number | null;
}

export async function checkStripeCheckoutStatus(sessionId: string): Promise<StripeCheckoutStatus> {
  const { data, error } = await supabase.functions.invoke<StripeCheckoutStatus>('stripe-checkout-status', {
    body: { sessionId },
  });
  if (error) throw error;
  return data!;
}
