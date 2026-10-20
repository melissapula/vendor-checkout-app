// Opens the Stripe Customer Portal for the vendor's own subscription to the
// paid plan, where they change between monthly and yearly, update their
// card, or cancel (at the period end). What the portal allows is set in the
// Stripe Dashboard, not here; see the README's billing setup steps. Changes
// made there reach store_subscriptions through stripe-billing-webhook.
//
// Deploy: supabase functions deploy stripe-billing-portal
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_...

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await getCallingStore(req);

    const { returnUrl } = await req.json();
    if (!returnUrl) return json({ error: 'returnUrl is required' }, 400);

    const { data: subscription, error: subscriptionError } = await supabase
      .from('store_subscriptions')
      .select('stripe_customer_id')
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription?.stripe_customer_id) {
      return json({ error: 'This store has no billing account yet' }, 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return json({ url: session.url });
  } catch (err) {
    if (err instanceof Response) return err;
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
