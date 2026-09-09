// Creates (if needed) the vendor's Stripe Express connected account and
// returns a fresh Account Link URL for Stripe's hosted onboarding form.
// Express + direct charges (not destination/standard): funds settle
// straight to the vendor's own account, this app takes no revenue cut, and
// the vendor — not the app owner — is merchant-of-record for their sales.
//
// Deploy: supabase functions deploy stripe-connect-onboarding
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
    const { returnUrl, refreshUrl } = await req.json();
    if (!returnUrl || !refreshUrl) {
      return new Response(JSON.stringify({ error: 'returnUrl and refreshUrl are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accountId = store.stripe_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
      const { error: updateError } = await supabase
        .from('stores')
        .update({ stripe_account_id: accountId })
        .eq('id', store.id);
      if (updateError) throw updateError;
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
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
