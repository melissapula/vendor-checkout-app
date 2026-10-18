// Polled by CheckoutScreen after showing the QR, to detect when the buyer
// has actually paid. Always retrieves the session under the *calling*
// store's own connected-account context — a session created for a
// different store simply doesn't exist under this one's stripeAccount
// header, so cross-tenant lookups fail closed by construction, not by an
// extra check here.
//
// Deploy: supabase functions deploy stripe-checkout-status
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_...

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';
import { splitBalanceTransactionFees } from '../_shared/platformFee.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { store } = await getCallingStore(req);
    if (!store.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'This store has no connected Stripe account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'sessionId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ['payment_intent.latest_charge.balance_transaction'] },
      { stripeAccount: store.stripe_account_id }
    );

    const paymentIntent = typeof session.payment_intent === 'object' ? session.payment_intent : null;
    const charge =
      paymentIntent && typeof paymentIntent.latest_charge === 'object' ? paymentIntent.latest_charge : null;
    const balanceTransaction =
      charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;

    return new Response(
      JSON.stringify({
        paymentStatus: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
        paymentIntentId: paymentIntent?.id ?? null,
        // Deprecated: Stripe's fee plus any platform fee, combined. Kept for
        // one release so a web app deployed before this function still
        // records a fee; remove once every client reads the two fields below.
        feeAmountCents: balanceTransaction?.fee ?? null,
        // Null until Stripe attaches the fee breakdown, which can lag the
        // 'paid' status — the client falls back to its own numbers then.
        ...splitBalanceTransactionFees(balanceTransaction?.fee_details ?? null),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
