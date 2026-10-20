// POSTs to the deployed stripe-billing-webhook with no Stripe signature and
// with a forged one. Both must be refused with 400 before the body is read
// as an event, and the test vendor's store_subscriptions row (if any) must
// be exactly the same afterwards. The forged body names the test vendor's
// store and an active status, so a broken signature check would show up as
// a changed row. Changes nothing.
const { createClient } = require('@supabase/supabase-js');
const { start, env, testVendor } = require('../lib/harness');

const { check, finish, crash } = start('billing-webhook');

async function post(headers, body) {
  const res = await fetch(`${env('EXPO_PUBLIC_SUPABASE_URL')}/functions/v1/stripe-billing-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
  return { status: res.status, text: await res.text() };
}

(async () => {
  const c = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('EXPO_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const vendor = testVendor();
  const { error: signInError } = await c.auth.signInWithPassword({ email: vendor.email, password: vendor.password });
  if (signInError) throw signInError;
  const { data: store, error: storeError } = await c.from('stores').select('id').single();
  if (storeError) throw storeError;
  const readRow = async () => {
    const { data, error } = await c.from('store_subscriptions').select('*').maybeSingle();
    if (error) throw error;
    return JSON.stringify(data);
  };
  const before = await readRow();

  const forged = JSON.stringify({
    id: 'evt_billing_webhook_test',
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_billing_webhook_test', status: 'active', metadata: { store_id: store.id } } },
  });

  const unsigned = await post({}, forged);
  check('no signature is refused with 400', unsigned.status === 400, `${unsigned.status} ${unsigned.text}`);

  const fakeSignature = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;
  const wrong = await post({ 'Stripe-Signature': fakeSignature }, forged);
  check('a wrong signature is refused with 400', wrong.status === 400, `${wrong.status} ${wrong.text}`);

  const after = await readRow();
  check("the test vendor's store_subscriptions row is unchanged", after === before, `before ${before}, after ${after}`);
  finish();
})().catch(crash);
