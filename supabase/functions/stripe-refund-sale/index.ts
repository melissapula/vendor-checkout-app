// Issues a real Stripe refund on the vendor's connected account for a
// card/Cash App Pay sale, then marks the sale refunded and restores the
// piece's stock via the same refund_sale() DB function self-reported
// refunds use directly (see supabase/migrations/0007_refund_void.sql). If
// the Stripe refund succeeds but the DB update then fails, this returns an
// error that says so explicitly — the buyer HAS been refunded at that
// point, so staff need to know to fix the record by hand rather than
// silently losing track of it.
//
// Deploy: supabase functions deploy stripe-refund-sale
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
    const { supabase, store } = await getCallingStore(req);
    if (!store.stripe_account_id) {
      return new Response(JSON.stringify({ error: 'This store has no connected Stripe account' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { saleId } = await req.json();
    if (!saleId) {
      return new Response(JSON.stringify({ error: 'saleId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Scoped by the caller's own RLS (see _shared/store.ts) — a sale
    // belonging to another store simply isn't found, same as the DB
    // function's own lookup.
    const { data: sale, error: saleError } = await supabase.from('sales').select('*').eq('id', saleId).single();
    if (saleError || !sale) {
      return new Response(JSON.stringify({ error: 'Sale not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (sale.refunded_at) {
      return new Response(JSON.stringify({ error: 'This sale was already refunded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!sale.processor_payment_id) {
      return new Response(JSON.stringify({ error: 'No Stripe payment on file for this sale' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await stripe.refunds.create(
      { payment_intent: sale.processor_payment_id },
      { stripeAccount: store.stripe_account_id }
    );

    const { data: result, error: refundError } = await supabase.rpc('refund_sale', { p_sale_id: saleId });
    if (refundError) {
      return new Response(
        JSON.stringify({
          error: `Stripe refund succeeded, but updating the sale record failed — the buyer HAS been refunded; fix the record manually. (${refundError.message})`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(result), {
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
