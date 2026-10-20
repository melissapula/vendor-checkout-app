import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Thin wrappers over the Stripe Edge Functions (supabase/functions/stripe-*)
// — one call each, throw on error, matching the style of deals.ts/fees.ts.
// supabase.functions.invoke() forwards the current session's Authorization
// header automatically, which is what lets each function run as (and only
// see data for) the calling store — see supabase/functions/_shared/store.ts.

// supabase-js's FunctionsHttpError always has the same generic message
// ("Edge Function returned a non-2xx status code") — the function's actual
// { error: "..." } body (every function in supabase/functions/stripe-*
// returns one on failure) is only reachable via error.context, the raw
// Response. Without this, every real cause (bad Stripe key, missing
// permission, stale test-mode account under a live key, etc.) was hidden
// behind that one useless sentence.
export async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return new Error(body.error);
    } catch {
      // Body wasn't JSON, or already consumed — fall back to the generic message below.
    }
  }
  return error instanceof Error ? error : new Error('Unknown error');
}

export async function startStripeOnboarding(returnUrl: string, refreshUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('stripe-connect-onboarding', {
    body: { returnUrl, refreshUrl },
  });
  if (error) throw await unwrapFunctionError(error);
  return data!.url;
}

// The vendor's own subscription to the paid plan (Stripe Billing on the
// platform account): stripe-billing-checkout and stripe-billing-portal.
// Each returns a Stripe-hosted page to send the browser to.
export async function startBillingCheckout(interval: 'month' | 'year', returnUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('stripe-billing-checkout', {
    body: { interval, returnUrl },
  });
  if (error) throw await unwrapFunctionError(error);
  return data!.url;
}

export async function openBillingPortal(returnUrl: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>('stripe-billing-portal', {
    body: { returnUrl },
  });
  if (error) throw await unwrapFunctionError(error);
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
  if (error) throw await unwrapFunctionError(error);
  return data!;
}

export interface StripeAccountBalance {
  availableCents: number;
  pendingCents: number;
}

export async function getStripeAccountBalance(): Promise<StripeAccountBalance> {
  const { data, error } = await supabase.functions.invoke<StripeAccountBalance>('stripe-account-balance', {
    body: {},
  });
  if (error) throw await unwrapFunctionError(error);
  return data!;
}

export interface StripeCheckoutSession {
  url: string;
  sessionId: string;
  // The application fee set on this charge; see
  // supabase/functions/_shared/platformFee.ts.
  platformFeeCents: number;
}

// feeBaseCents is what the platform fee is a percentage of: the subtotal
// after deals, without the tip or any Stripe fee passed to the buyer.
export async function createStripeCheckout(
  amountCents: number,
  feeBaseCents: number,
  idempotencyKey: string,
  paymentMethodType: 'card' | 'cashapp'
): Promise<StripeCheckoutSession> {
  const { data, error } = await supabase.functions.invoke<StripeCheckoutSession>('stripe-create-checkout', {
    body: { amountCents, feeBaseCents, idempotencyKey, paymentMethodType },
  });
  if (error) throw await unwrapFunctionError(error);
  return data!;
}

export interface StripeCheckoutStatus {
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentIntentId: string | null;
  // Deprecated: Stripe's fee and the platform fee combined. Use the two
  // fields below; this is only the fallback while they're null.
  feeAmountCents: number | null;
  stripeFeeCents: number | null;
  platformFeeCents: number | null;
}

export async function checkStripeCheckoutStatus(sessionId: string): Promise<StripeCheckoutStatus> {
  const { data, error } = await supabase.functions.invoke<StripeCheckoutStatus>('stripe-checkout-status', {
    body: { sessionId },
  });
  if (error) throw await unwrapFunctionError(error);
  return data!;
}
