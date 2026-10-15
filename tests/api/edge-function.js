// Calls the deployed stripe-connect-onboarding function as the demo login
// (must be refused) and as an ordinary vendor with an empty body (must get
// past the demo check and stop at input validation, before touching Stripe).
// Changes nothing.
const { createClient } = require('@supabase/supabase-js');
const { start, env, testVendor, DEMO } = require('../lib/harness');

const { check, finish, crash } = start('edge-function');
const SITE = 'https://vendor-checkout-app.expo.app';

async function call({ email, password }, body) {
  const c = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('EXPO_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) return { status: 0, text: `sign-in failed: ${error.message}` };
  const res = await fetch(`${env('EXPO_PUBLIC_SUPABASE_URL')}/functions/v1/stripe-connect-onboarding`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: env('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

(async () => {
  const demo = await call(DEMO, { returnUrl: SITE, refreshUrl: SITE });
  check('demo login is refused before Stripe', demo.status === 403 && demo.text.includes('demo'), `${demo.status} ${demo.text}`);
  const vendor = await call(testVendor(), {});
  check('vendor gets past the demo check to input validation', vendor.status === 400 && vendor.text.includes('returnUrl'), `${vendor.status} ${vendor.text}`);
  finish();
})().catch(crash);
