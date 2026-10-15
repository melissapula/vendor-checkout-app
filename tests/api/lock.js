// Direct API calls (no app, so no app-side guard): the demo login must be
// refused everywhere, and an ordinary vendor must be unaffected.
// WRITES: as the test vendor it inserts, updates and deletes one event row.
const { createClient } = require('@supabase/supabase-js');
const { start, env, testVendor, DEMO } = require('../lib/harness');

const { check, finish, crash } = start('lock');
const mk = () =>
  createClient(env('EXPO_PUBLIC_SUPABASE_URL'), env('EXPO_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const TABLES = ['pieces', 'sales', 'deals', 'events', 'saved_reports', 'inventory_adjustments'];
const counts = async (c) =>
  Object.fromEntries(
    await Promise.all(TABLES.map(async (t) => [t, (await c.from(t).select('*', { count: 'exact', head: true })).count]))
  );

(async () => {
  const demo = mk();
  await demo.auth.signInWithPassword(DEMO);
  const { data: store } = await demo.from('stores').select('*').single();
  const before = await counts(demo);
  const { data: piece } = await demo.from('pieces').select('*').gt('quantity_remaining', 3).eq('type', 'print').limit(1).single();
  const { data: sale } = await demo.from('sales').select('*').is('refunded_at', null).limit(1).single();
  check('demo can still read', before.pieces === 26 && before.sales === 89, JSON.stringify(before));
  check('demo store is flagged', store.is_demo === true);

  const upd = async (t, patch) =>
    ((await demo.from(t).update(patch).eq(t === 'stores' ? 'id' : 'store_id', store.id).select('*')).data || []).length;
  check('update store refused', (await upd('stores', { name: 'HACKED', is_demo: false, stripe_account_id: 'acct_x' })) === 0);
  check('update pieces refused', (await upd('pieces', { title: 'HACKED' })) === 0);
  check('update sales refused', (await upd('sales', { sale_price: 1 })) === 0);
  check('update deals refused', (await upd('deals', { name: 'HACKED' })) === 0);
  check('update events refused', (await upd('events', { name: 'HACKED' })) === 0);
  check('update saved_reports refused', (await upd('saved_reports', { title: 'HACKED' })) === 0);
  for (const t of ['saved_reports', 'sales', 'deals', 'events', 'pieces']) {
    const { data } = await demo.from(t).delete().eq('store_id', store.id).select('id');
    check(`delete ${t} refused`, (data || []).length === 0);
  }
  const ins = async (t, row) => !!(await demo.from(t).insert(row)).error;
  check('insert piece refused', await ins('pieces', { sku: 'HACK-1', title: 'HACKED', price: 1, type: 'sticker', status: 'available', quantity_remaining: 1 }));
  check('insert sale refused', await ins('sales', { piece_id: piece.id, sale_price: 1, payment_method: 'cash' }));
  check('insert deal refused', await ins('deals', { name: 'HACKED', type: 'amount_off', trigger_condition: { count: 1 }, discount_value: 1 }));
  check('insert event refused', await ins('events', { name: 'HACKED', start_date: '2026-01-01', end_date: '2026-01-01' }));
  check('insert saved report refused', await ins('saved_reports', { title: 'HACKED', from_date: '2026-01-01', to_date: '2026-01-01', snapshot: {} }));
  check('insert adjustment refused', await ins('inventory_adjustments', { piece_id: piece.id, type: 'loss', quantity: 1 }));
  check('cart write refused', !!(await demo.from('store_carts').upsert({ store_id: store.id, items: [{ hacked: true }] })).error);
  check('second store refused', await ins('stores', { owner_id: store.owner_id, name: 'HACKED 2', admin_pin: '0000' }));
  const r1 = await demo.rpc('finalize_sale', { sale_rows: [{ piece_id: piece.id, sale_price: 1, payment_method: 'cash', fee_amount: 0 }] });
  check('checkout (finalize_sale) refused', !!r1.error, r1.error && r1.error.message.slice(0, 70));
  const r2 = await demo.rpc('refund_sale', { p_sale_id: sale.id });
  check('refund (refund_sale) refused', !!r2.error, r2.error && r2.error.message.slice(0, 70));
  const r3 = await demo.rpc('log_inventory_adjustment', { p_piece_id: piece.id, p_type: 'loss', p_quantity: 1, p_reason: 'hack' });
  check('loss log (log_inventory_adjustment) refused', !!r3.error, r3.error && r3.error.message.slice(0, 70));

  const after = await counts(demo);
  const { data: store2 } = await demo.from('stores').select('*').single();
  const { data: piece2 } = await demo.from('pieces').select('*').eq('id', piece.id).single();
  const { data: sale2 } = await demo.from('sales').select('*').eq('id', sale.id).single();
  const { data: cart } = await demo.from('store_carts').select('items').maybeSingle();
  check('row counts unchanged', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
  check('store unchanged', JSON.stringify(store) === JSON.stringify(store2));
  check('piece unchanged (title, stock)', JSON.stringify(piece) === JSON.stringify(piece2));
  check('sale unchanged (not refunded)', JSON.stringify(sale) === JSON.stringify(sale2));
  check('cart still empty', !cart || JSON.stringify(cart.items) === '[]', cart && JSON.stringify(cart.items));
  const { count: hacked } = await demo.from('pieces').select('*', { count: 'exact', head: true }).ilike('title', '%HACKED%');
  check('nothing named HACKED exists', hacked === 0);

  // An ordinary vendor must be completely unaffected by the demo's rules.
  const vendor = testVendor();
  const v = mk();
  const { error: e } = await v.auth.signInWithPassword({ email: vendor.email, password: vendor.password });
  check('ordinary vendor can sign in', !e, e && e.message);
  if (e) return finish();
  const { data: vs } = await v.from('stores').select('*').single();
  check('ordinary vendor is not flagged', vs.is_demo === false, vs.name);
  const { data: u } = await v.from('stores').update({ name: vs.name }).eq('id', vs.id).select('id');
  check('ordinary vendor can update their store', (u || []).length === 1);
  const { data: ev, error: evErr } = await v
    .from('events')
    .insert({ name: 'lock test (delete me)', start_date: '2026-01-01', end_date: '2026-01-01' })
    .select()
    .single();
  check('ordinary vendor can insert', !evErr, evErr && evErr.message);
  if (ev) {
    const { data: ue } = await v.from('events').update({ notes: 'x' }).eq('id', ev.id).select('id');
    check('ordinary vendor can update', (ue || []).length === 1);
    const { data: de } = await v.from('events').delete().eq('id', ev.id).select('id');
    check('ordinary vendor can delete (test row removed)', (de || []).length === 1);
  }
  const { count: vp } = await v.from('pieces').select('*', { count: 'exact', head: true });
  const { count: vsales } = await v.from('sales').select('*', { count: 'exact', head: true });
  check('ordinary vendor store intact', vp === 7 && vsales === 3, `${vp} pieces, ${vsales} sales`);
  finish();
})().catch(crash);
