// Checks whether the vendor's connected Stripe account can actually accept
// charges yet, and caches the result on stores.stripe_onboarding_complete
// so Settings/Checkout don't need to hit Stripe on every render. Called
// once when the vendor returns from Stripe's hosted onboarding, and via a
// manual "Refresh status" button (Account Links expire after a few minutes,
// so an abandoned onboarding attempt needs to be restartable).
//
// Deploy: supabase functions deploy stripe-account-status
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
      return new Response(JSON.stringify({ connected: false, chargesEnabled: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const account = await stripe.accounts.retrieve(store.stripe_account_id);
    const chargesEnabled = !!account.charges_enabled;

    if (chargesEnabled !== store.stripe_onboarding_complete) {
      const { error: updateError } = await supabase
        .from('stores')
        .update({ stripe_onboarding_complete: chargesEnabled })
        .eq('id', store.id);
      if (updateError) throw updateError;
    }

    return new Response(
      JSON.stringify({
        connected: true,
        chargesEnabled,
        detailsSubmitted: !!account.details_submitted,
        requirementsDue: account.requirements?.currently_due ?? [],
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
