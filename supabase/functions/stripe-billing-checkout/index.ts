// Starts a vendor's own subscription to the paid plan: a Stripe Checkout
// Session in subscription mode on the *platform* account (Stripe Billing),
// not on the vendor's connected account like stripe-create-checkout. The
// store id goes on the session and on the subscription's metadata, which is
// the only place stripe-billing-webhook takes it from.
//
// A 14-day trial is offered once per store: only when the store has never
// had a subscription recorded (get_plan_state's has_subscribed_before).
//
// Deploy: supabase functions deploy stripe-billing-checkout
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_PRICE_MONTHLY=price_... STRIPE_PRICE_YEARLY=price_...

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const DEMO_EMAIL = 'demo@example.com';
const TRIAL_DAYS = 14;
const PRICE_ENV_BY_INTERVAL: Record<string, string> = {
  month: 'STRIPE_PRICE_MONTHLY',
  year: 'STRIPE_PRICE_YEARLY',
};
// The statuses store_has_paid_plan (migration 0025) counts as paid.
const LIVE_STATUSES = ['trialing', 'active', 'past_due'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, store } = await getCallingStore(req);

    // The demo store's login is public; it must never start a real
    // subscription (see stripe-connect-onboarding for the same check).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (store.is_demo || user?.email?.toLowerCase() === DEMO_EMAIL) {
      return json({ error: 'Billing is turned off in the demo store' }, 403);
    }

    const { interval, returnUrl } = await req.json();
    const priceEnv = typeof interval === 'string' ? PRICE_ENV_BY_INTERVAL[interval] : undefined;
    if (!priceEnv) return json({ error: "interval must be 'month' or 'year'" }, 400);

    let successUrl: URL;
    let cancelUrl: URL;
    try {
      successUrl = new URL(returnUrl);
      cancelUrl = new URL(returnUrl);
    } catch {
      return json({ error: 'returnUrl must be a full URL' }, 400);
    }
    successUrl.searchParams.set('billing', 'done');
    cancelUrl.searchParams.set('billing', 'cancelled');

    const price = Deno.env.get(priceEnv);
    if (!price) return json({ error: `Billing is not set up yet (${priceEnv} is missing)` }, 500);

    // Read through the caller's client: the select policy only shows this
    // store's own row.
    const { data: subscription, error: subscriptionError } = await supabase
      .from('store_subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status')
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    if (subscription?.status && LIVE_STATUSES.includes(subscription.status)) {
      return json({ error: 'This store already has a subscription. Use Manage billing to change or cancel it.' }, 409);
    }

    // stripe-node leaves undefined params out of the request, so an
    // undefined trial or customer is the same as not sending one.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: store.id,
      subscription_data: {
        metadata: { store_id: store.id },
        trial_period_days: subscription?.stripe_subscription_id ? undefined : TRIAL_DAYS,
      },
      // Without one, Checkout creates a new Stripe customer.
      customer: subscription?.stripe_customer_id ?? undefined,
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
    });

    return json({ url: session.url });
  } catch (err) {
    if (err instanceof Response) return err;
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
