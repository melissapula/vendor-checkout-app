// Calls the deployed stripe-create-checkout function as the test vendor
// with an old Terms version (must be refused with a Terms message), then
// with the current one (must get past the Terms check and stop at the
// "not connected to Stripe" check, since the test vendor has no Stripe
// account). Neither call reaches Stripe.
// WRITES: sets the test vendor's stores.terms_version_accepted to 1 for the
// first call, then puts back whatever was there before.
const { createClient } = require('@supabase/supabase-js');
const { start, env, testVendor } = require('../lib/harness');

const { check, finish, crash } = start('terms-gate');
const OLD_VERSION = 1;
const CURRENT_VERSION = 2; // src/lib/terms.ts CURRENT_TERMS_VERSION

(async () => {
  const c = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('EXPO_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const vendor = testVendor();
  const { data: auth, error: signInError } = await c.auth.signInWithPassword({ email: vendor.email, password: vendor.password });
  if (signInError) throw signInError;

  const { data: store, error: readError } = await c.from('stores').select('id, terms_version_accepted').single();
  if (readError) throw readError;
  const setVersion = async (v) => {
    const { error } = await c.from('stores').update({ terms_version_accepted: v }).eq('id', store.id);
    if (error) throw error;
  };
  const checkout = async () => {
    const res = await fetch(`${env('EXPO_PUBLIC_SUPABASE_URL')}/functions/v1/stripe-create-checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.session.access_token}`,
        apikey: env('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amountCents: 100, feeBaseCents: 100, idempotencyKey: `terms-gate-${Date.now()}`, paymentMethodType: 'card' }),
    });
    return { status: res.status, text: await res.text() };
  };

  try {
    await setVersion(OLD_VERSION);
    const old = await checkout();
    check('an old Terms version is refused with a Terms message', old.status === 403 && old.text.includes('Terms'), `${old.status} ${old.text}`);

    await setVersion(CURRENT_VERSION);
    const current = await checkout();
    check('the current Terms version gets past to the Stripe check', current.status === 400 && current.text.includes('Stripe'), `${current.status} ${current.text}`);
  } finally {
    await setVersion(store.terms_version_accepted);
  }
  finish();
})().catch(crash);
