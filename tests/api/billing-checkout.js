// Calls the deployed stripe-billing-checkout function as the demo login
// (must be refused), as the test vendor with a made-up interval (must be a
// 400), and as the test vendor with interval 'month' (must return a Stripe
// Checkout URL). No browser opens the URL, so nobody pays; Stripe expires
// the unused session on its own after 24 hours, and no Stripe customer is
// created until a session is completed. Changes nothing in the database.
// Fails if the test vendor has a live subscription (trialing, active or
// past_due), since the function then points to the portal instead.
const { createClient } = require('@supabase/supabase-js');
const { start, env, testVendor, DEMO } = require('../lib/harness');

const { check, finish, crash } = start('billing-checkout');
const SITE = 'https://vendor-checkout-app.expo.app';

async function call({ email, password }, body) {
  const c = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('EXPO_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) return { status: 0, text: `sign-in failed: ${error.message}` };
  const res = await fetch(`${env('EXPO_PUBLIC_SUPABASE_URL')}/functions/v1/stripe-billing-checkout`, {
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
  const demo = await call(DEMO, { interval: 'month', returnUrl: SITE });
  check('demo login is refused before Stripe', demo.status === 403 && demo.text.includes('demo'), `${demo.status} ${demo.text}`);

  const week = await call(testVendor(), { interval: 'week', returnUrl: SITE });
  check("interval 'week' is refused with 400", week.status === 400 && week.text.includes('interval'), `${week.status} ${week.text}`);

  const month = await call(testVendor(), { interval: 'month', returnUrl: SITE });
  let url = '';
  try {
    url = JSON.parse(month.text).url || '';
  } catch {
    // Not JSON: the check below fails and prints the raw text.
  }
  check(
    "interval 'month' returns a Stripe Checkout URL",
    month.status === 200 && url.startsWith('https://checkout.stripe.com/'),
    `${month.status} ${url || month.text}`
  );
  finish();
})().catch(crash);
