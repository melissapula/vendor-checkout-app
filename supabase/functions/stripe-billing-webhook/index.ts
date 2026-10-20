// Keeps store_subscriptions in step with Stripe Billing. Stripe calls this
// for the platform's own subscription events (the paid plan), not for
// vendors' connected accounts.
//
// This is the first function in the repo that runs with no caller login and
// writes with the service-role key, which bypasses RLS. Every other
// function runs as the calling vendor (see _shared/store.ts). That is safe
// here only because of the order below:
//   1. The Stripe signature is checked against the raw body before anything
//      in it is used. Any failure is a 400.
//   2. The store id is taken only from what the platform itself set in
//      stripe-billing-checkout: the subscription's metadata.store_id, or the
//      Checkout Session's client_reference_id.
//   3. The subscription is re-fetched from Stripe, so the row reflects
//      Stripe's current state whatever order events arrive in.
// comped is never written here (see _shared/billing.ts).
//
// Deploy: supabase functions deploy stripe-billing-webhook --no-verify-jwt
//   (Stripe sends no Supabase login, so the gateway's JWT check must be off.)
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { subscriptionRowFromStripe } from '../_shared/billing.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});
// Deno has no Node crypto, so signature checks use Web Crypto, which is
// async: hence constructEventAsync rather than constructEvent.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const SUBSCRIPTION_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) return json({ error: 'STRIPE_WEBHOOK_SECRET is not set' }, 500);
  if (!signature) return json({ error: 'Missing Stripe-Signature header' }, 400);

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    return json({ error: `Signature check failed: ${err instanceof Error ? err.message : 'unknown'}` }, 400);
  }

  try {
    let subscriptionId: string | null = null;
    let sessionStoreId: string | null = null;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') return json({ received: true, ignored: 'not a subscription checkout' });
      subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      sessionStoreId = session.client_reference_id;
    } else if (SUBSCRIPTION_EVENTS.includes(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    } else {
      // Answer 200 for anything else, so Stripe doesn't keep retrying it.
      return json({ received: true, ignored: event.type });
    }
    if (!subscriptionId) return json({ received: true, ignored: 'no subscription on the session' });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const storeId = subscription.metadata?.store_id || sessionStoreId;
    // A subscription made outside stripe-billing-checkout (by hand in the
    // Dashboard, say) has no store to belong to. The reason shows in the
    // Dashboard's delivery log.
    if (!storeId) return json({ received: true, ignored: 'no store_id on the subscription' });

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not available to this function');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: upsertError } = await admin
      .from('store_subscriptions')
      .upsert(
        { store_id: storeId, ...subscriptionRowFromStripe(subscription), updated_at: new Date().toISOString() },
        { onConflict: 'store_id' }
      );
    if (upsertError) throw upsertError;

    return json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry the event later, which is what a transient
    // Stripe or database failure needs.
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
