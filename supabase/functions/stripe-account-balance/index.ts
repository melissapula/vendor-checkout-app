// Shows the vendor how much money is currently sitting in their Stripe
// account from completed sales — split into "available" (Stripe's next
// automatic payout will include this) and "pending" (still clearing).
// Stripe's own payout schedule handles moving it to their bank; this is
// read-only visibility into the balance ahead of that, not a way to
// trigger or change a payout.
//
// Deploy: supabase functions deploy stripe-account-balance
// Secrets: STRIPE_SECRET_KEY (shared with the other stripe-* functions)
// Requires "Balance: Read" added under Connect Permissions on the
// platform's restricted key — not part of the original permission set,
// since nothing needed it until now.

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

function sumCents(entries: { amount: number }[]): number {
  return entries.reduce((total, e) => total + e.amount, 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { store } = await getCallingStore(req);

    if (!store.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'Stripe account not connected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const balance = await stripe.balance.retrieve({ stripeAccount: store.stripe_account_id });

    return new Response(
      JSON.stringify({
        availableCents: sumCents(balance.available),
        pendingCents: sumCents(balance.pending),
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
