// Creates a Stripe Checkout Session for the cart total, on the vendor's own
// connected account (a direct charge — funds settle straight to them). The
// resulting URL gets QR-encoded client-side; the buyer scans it with their
// own phone and pays there (typed card, or Apple Pay/Google Pay if Stripe
// detects support on their device) — this app's own screen never collects
// card details at all.
//
// The platform takes an application fee on the charge: PLATFORM_FEE_RATE of
// the client's feeBaseCents (the subtotal after deals, no tip), except for
// stores listed in PLATFORM_FEE_EXEMPT_STORE_IDS. Unset rate = no fee. See
// _shared/platformFee.ts. The Terms no longer state a fee, so leave the rate
// unset. A store that hasn't accepted the current Terms version
// (_shared/terms.ts) is refused with a 403.
//
// Deploy: supabase functions deploy stripe-create-checkout
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_...
//          supabase secrets set PLATFORM_FEE_RATE=0.01 (not set: see above)
//          supabase secrets set PLATFORM_FEE_EXEMPT_STORE_IDS=<id>,<id> (optional)

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';
import { parseExemptStoreIds, parsePlatformFeeRate, platformFeeCents } from '../_shared/platformFee.ts';
import { CURRENT_TERMS_VERSION } from '../_shared/terms.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { store } = await getCallingStore(req);

    // The app shows the accept screen first (src/lib/terms.ts); this stops a
    // direct call from taking a card sale under terms that don't state the
    // fee. Checked before the Stripe check so tests/api/terms-gate.js can
    // reach it as a vendor with no Stripe account.
    if ((store.terms_version_accepted ?? 0) < CURRENT_TERMS_VERSION) {
      return new Response(
        JSON.stringify({ error: 'Accept the updated Terms of Service in the app before taking card payments' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!store.stripe_account_id || !store.stripe_onboarding_complete) {
      return new Response(JSON.stringify({ error: 'This store has not finished connecting Stripe yet' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { amountCents, feeBaseCents, idempotencyKey, paymentMethodType } = await req.json();
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return new Response(JSON.stringify({ error: 'amountCents must be a positive integer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isInteger(feeBaseCents) || feeBaseCents < 0 || feeBaseCents > amountCents) {
      return new Response(JSON.stringify({ error: 'feeBaseCents must be an integer from 0 to amountCents' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parsed before the exemption check so a bad rate secret fails every
    // store's card checkout, not only the non-exempt ones.
    const configuredRate = parsePlatformFeeRate(Deno.env.get('PLATFORM_FEE_RATE'));
    const isExempt = parseExemptStoreIds(Deno.env.get('PLATFORM_FEE_EXEMPT_STORE_IDS')).has(store.id);
    const fee = platformFeeCents(feeBaseCents, isExempt ? 0 : configuredRate);

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
        // Stripe rejects a zero application fee, so leave it off entirely.
        ...(fee > 0 ? { payment_intent_data: { application_fee_amount: fee } } : {}),
      },
      {
        stripeAccount: store.stripe_account_id,
        idempotencyKey: idempotencyKey || undefined,
      }
    );

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id, platformFeeCents: fee }), {
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
