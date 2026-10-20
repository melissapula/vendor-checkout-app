// Direct API calls as the test vendor against the plan tables from
// migration 0025: the plan state is readable, it can't be written by a
// vendor, and while plans_enforced is off a paid-only feature (a deal)
// still saves.
// WRITES: inserts one deal row, then deletes it.
const { createClient } = require('@supabase/supabase-js');
const { start, env, testVendor } = require('../lib/harness');

const { check, finish, crash } = start('plan-schema');

(async () => {
  const c = createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('EXPO_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const vendor = testVendor();
  const { error: signInError } = await c.auth.signInWithPassword({ email: vendor.email, password: vendor.password });
  if (signInError) throw signInError;
  const { data: store, error: readError } = await c.from('stores').select('id').single();
  if (readError) throw readError;

  const { data: plan, error: planError } = await c.rpc('get_plan_state');
  check('get_plan_state() says plans are not enforced', !planError && plan && plan.plans_enforced === false, planError ? planError.message : JSON.stringify(plan));

  // The migration revokes these writes from vendors outright, so each one
  // fails with Postgres's permission-denied code even though the test vendor
  // has no row to change. Checking the code, not just "an error", keeps a
  // missing table from passing as a refusal.
  const PERMISSION_DENIED = '42501';
  const refused = (res) => !!res.error && res.error.code === PERMISSION_DENIED;
  const ins = await c.from('store_subscriptions').insert({ store_id: store.id, comped: true });
  check('insert into store_subscriptions refused', refused(ins), ins.error && `${ins.error.code} ${ins.error.message}`);
  const upd = await c.from('store_subscriptions').update({ comped: true }).eq('store_id', store.id);
  check('update of store_subscriptions refused', refused(upd), upd.error && `${upd.error.code} ${upd.error.message}`);
  const del = await c.from('store_subscriptions').delete().eq('store_id', store.id);
  check('delete from store_subscriptions refused', refused(del), del.error && `${del.error.code} ${del.error.message}`);
  const flip = await c.from('billing_settings').update({ plans_enforced: false }).eq('id', true);
  check('update of billing_settings refused', refused(flip), flip.error && `${flip.error.code} ${flip.error.message}`);

  const { data: deal, error: dealError } = await c
    .from('deals')
    .insert({ name: 'plan-schema test', type: 'amount_off', trigger_condition: { count: 1 }, discount_value: 1, active: false })
    .select('id')
    .single();
  check('a deal still saves while plans are not enforced', !dealError && deal, dealError && dealError.message);
  if (deal) {
    const { error: cleanupError } = await c.from('deals').delete().eq('id', deal.id);
    check('the test deal is deleted again', !cleanupError, cleanupError && cleanupError.message);
  }
  finish();
})().catch(crash);
