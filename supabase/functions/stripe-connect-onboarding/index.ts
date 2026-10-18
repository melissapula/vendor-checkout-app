// Creates (if needed) the vendor's Stripe connected account and returns a
// fresh Account Link URL for Stripe's hosted onboarding form. Direct charges
// (not destination): funds settle straight to the vendor's own account, the
// platform's only cut is the application fee in _shared/platformFee.ts, and
// the vendor — not the app owner — is
// merchant-of-record for their sales. New accounts use Stripe-owned pricing
// with the full Stripe dashboard; see _shared/connectAccount.ts.
//
// Deploy: supabase functions deploy stripe-connect-onboarding
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_...

import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';
import { getCallingStore } from '../_shared/store.ts';
import { NEW_CONNECTED_ACCOUNT_PARAMS } from '../_shared/connectAccount.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
});

const DEMO_EMAIL = 'demo@example.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, store } = await getCallingStore(req);

    // The shared public demo store (see src/lib/demo.ts) must never get a
    // real connected account — its login is published on the sign-in
    // screen, so anyone could otherwise attach their own Stripe identity
    // to it. The app hides this path for the demo too; this is the check
    // that actually enforces it.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (store.is_demo || user?.email?.toLowerCase() === DEMO_EMAIL) {
      return new Response(JSON.stringify({ error: 'Stripe is turned off in the demo store' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { returnUrl, refreshUrl } = await req.json();
    if (!returnUrl || !refreshUrl) {
      return new Response(JSON.stringify({ error: 'returnUrl and refreshUrl are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accountId = store.stripe_account_id as string | null;

    // A stored account_id can be stale — most commonly because it was
    // created under a *different* Stripe key than the one configured now
    // (e.g. the platform switched from a test key to a live key). Live and
    // test accounts are entirely separate namespaces, so accounts.retrieve
    // throws "No such account" in that case, and the old code below would
    // have let that surface as an opaque failure from accountLinks.create
    // instead. Treat "can't retrieve it" as "there's no usable account yet"
    // and fall through to creating a fresh one.
    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId);
      } catch {
        accountId = null;
      }
    }

    if (!accountId) {
      const account = await stripe.accounts.create(NEW_CONNECTED_ACCOUNT_PARAMS);
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
