// Creates a Stripe Checkout Session for the cart total, on the vendor's own
// connected account (a direct charge — funds settle straight to them). The
// resulting URL gets QR-encoded client-side; the buyer scans it with their
// own phone and pays there (typed card, or Apple Pay/Google Pay if Stripe
// detects support on their device) — this app's own screen never collects
// card details at all.
//
// Deploy: supabase functions deploy stripe-create-checkout
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_...

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { store } = await getCallingStore(req);

    if (!store.stripe_account_id || !store.stripe_onboarding_complete) {
      return new Response(JSON.stringify({ error: 'This store has not finished connecting Stripe yet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { amountCents, idempotencyKey, paymentMethodType } = await req.json();
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return new Response(JSON.stringify({ error: 'amountCents must be a positive integer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 'card' or 'cashapp' — both are real Stripe payment method types that
    // work on this Connect (Direct charge) setup. Scoping the session to one
    // type keeps the buyer's QR pointed at exactly the method they picked in
    // the app, instead of Stripe's own method-picker page.
    const validTypes = ['card', 'cashapp'];
    const type = validTypes.includes(paymentMethodType) ? paymentMethodType : 'card';

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: [type],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: `Purchase — ${store.name}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: 'https://vendor-checkout-app.expo.app/?paid=1',
        cancel_url: 'https://vendor-checkout-app.expo.app/?paid=0',
      },
      {
        stripeAccount: store.stripe_account_id,
        idempotencyKey: idempotencyKey || undefined,
      }
    );

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
