#!/usr/bin/env node
// Creates (or resets) the public demo store, "Juniper Lane Studio" — the
// shared account behind the "Explore the demo store" button on the sign-in
// screen (see src/lib/demo.ts). Safe to re-run any time: it wipes that one
// store and refills it with the same sample inventory, three past art
// fairs' worth of sales, deals, loss/donation entries and saved reports,
// with every date recalculated relative to today so "last weekend's fair"
// stays last weekend. It also puts the demo login back to the published
// password, in case a visitor changed it.
//
// The demo store is read-only for anyone signed in as it (see
// supabase/migrations/0020_demo_read_only.sql), keyed on the store's
// is_demo flag. This script switches that flag off, refills the store, and
// switches it back on — even if the refill fails partway.
//
// Nearly everything here runs signed in AS the demo user, under the same
// row-level security every vendor is under — so this script structurally
// can't read or change any other store's data. The service-role key (which
// bypasses those rules) is fetched from the Supabase CLI at run time, never
// written to disk, and used for exactly three things row-level security
// can't do: creating/repairing the demo login itself, flipping the demo
// store's is_demo flag, and clearing its loss/donation log (an append-only
// table by design, with no delete policy for anyone).
//
// Usage: npm run seed-demo
// Needs: migration 0020 applied, .env (project URL + anon key) and a logged-in Supabase CLI
// (`npx supabase login`) with access to this project.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// Keep in step with src/lib/demo.ts.
const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'artfairdemo';
const STORE_NAME = 'Juniper Lane Studio';
const STAFF_PIN = '1234';
const ART_BASE = 'https://vendor-checkout-app.expo.app/demo';

function log(msg) {
  console.log(`[seed-demo] ${msg}`);
}

function readEnv() {
  const env = {};
  const file = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function fetchServiceRoleKey(projectRef) {
  const out = execSync(`npx --yes supabase projects api-keys --project-ref ${projectRef} -o json`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keys = JSON.parse(out.slice(out.indexOf('[')));
  const key = keys.find((k) => k.name === 'service_role' || k.id === 'service_role');
  if (!key || !key.api_key || /[·•*]{3}/.test(key.api_key)) {
    throw new Error('Could not read the service_role key from the Supabase CLI — is it logged in?');
  }
  return key.api_key;
}

// Deterministic, so every reset produces the same store rather than a new
// random one each time.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FEE_RATES = {
  venmo: { rate: 0.019, fixed: 0.1 },
  paypal: { rate: 0.0299, fixed: 0.49 },
  cash: { rate: 0, fixed: 0 },
};
// Same rule as src/lib/fees.ts's calculateFee.
function feeFor(amount, method) {
  const { rate, fixed } = FEE_RATES[method];
  return amount <= 0 ? 0 : Math.round((amount * rate + fixed) * 100) / 100;
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 15:00–21:00 UTC is daytime on that same calendar date everywhere in the
// US (and evening in Europe), so Reports — which buckets a sale into an
// event by the viewer's *local* date — attributes it to the right day no
// matter where the visitor is.
function stamp(d, minutesAfter1500utc) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 15, minutesAfter1500utc)).toISOString();
}

const ORIGINALS = [
  { key: 'ridge', title: 'Morning on the Ridge', art: 'morning-on-the-ridge', medium: 'Acrylic on canvas', w: 16, h: 20, series: 'High Country', price: 425, cost: 60 },
  { key: 'lake', title: 'Twilight Over Pine Lake', art: 'twilight-over-pine-lake', medium: 'Oil on canvas', w: 18, h: 24, series: 'High Country', price: 560, cost: 85 },
  { key: 'harbor', title: 'Harbor Fog', art: 'harbor-fog', medium: 'Watercolor on paper', w: 11, h: 14, series: 'Coastline', price: 240, cost: 30 },
  { key: 'dunes', title: 'Golden Hour Dunes', art: 'golden-hour-dunes', medium: 'Acrylic on canvas', w: 12, h: 16, series: 'Coastline', price: 310, cost: 45 },
  { key: 'meadow', title: 'Wildflower Meadow', art: 'wildflower-meadow', medium: 'Oil on canvas', w: 16, h: 20, series: 'Garden Studies', price: 385, cost: 55 },
  { key: 'canyon', title: 'Ember Canyon', art: 'ember-canyon', medium: 'Acrylic on canvas', w: 24, h: 30, series: 'Desert Light', price: 720, cost: 110 },
  { key: 'market', title: 'Night Market', art: 'night-market', medium: 'Mixed media on panel', w: 12, h: 12, series: 'City Nights', price: 195, cost: 25 },
  { key: 'orchard', title: 'Quiet Orchard', art: 'quiet-orchard', medium: 'Watercolor on paper', w: 9, h: 12, series: 'Garden Studies', price: 180, cost: 20 },
];

// Which originals have prints, and in which sizes.
const PRINT_SIZES = {
  '5x7': { price: 16, run: 60, cost: 3, weight: 5 },
  '8x10': { price: 28, run: 40, cost: 6, weight: 4 },
  '11x14': { price: 45, run: 20, cost: 11, weight: 2 },
};
const PRINTS = [
  ['ridge', ['5x7', '8x10', '11x14']],
  ['lake', ['5x7', '8x10', '11x14']],
  ['harbor', ['5x7', '8x10']],
  ['dunes', ['5x7', '8x10']],
  ['meadow', ['5x7', '8x10']],
  ['canyon', ['5x7', '8x10', '11x14']],
];

const SMALL_GOODS = [
  { key: 'sticker', title: 'Pine Lake Vinyl Sticker', art: 'pine-sticker', type: 'sticker', size: 'Small', price: 4, stocked: 150, cost: 0.6, weight: 7 },
  { key: 'postcards', title: 'Postcard Set (4 designs)', art: 'postcard-set', type: 'postcard', size: null, price: 12, stocked: 60, cost: 2.5, weight: 3 },
  { key: 'pin', title: 'Little Fox Enamel Pin', art: 'fox-pin', type: 'pin', size: null, price: 10, stocked: 40, cost: 2.2, weight: 3 },
];

// Items whose stock should land on a specific number, so the inventory
// screen shows a low-stock badge and an out-of-stock row whatever the
// random sales happened to pick. Their starting stock is back-filled to
// whatever makes the arithmetic true.
const TARGET_REMAINING = { 'lake:8x10': 2, 'ridge:5x7': 3, 'canyon:11x14': 0, pin: 1 };

async function main() {
  const env = readEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('.env is missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const projectRef = new URL(url).hostname.split('.')[0];

  log('Fetching the service-role key from the Supabase CLI (kept in memory only)...');
  const admin = createClient(url, fetchServiceRoleKey(projectRef), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 1. The demo login ---------------------------------------------------
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let demoUser = list.users.find((u) => (u.email || '').toLowerCase() === DEMO_EMAIL);
  if (!demoUser) {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    demoUser = data.user;
    log(`Created the demo login (${DEMO_EMAIL}).`);
  } else {
    const { error } = await admin.auth.admin.updateUserById(demoUser.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    log('Demo login already existed — password put back to the published one.');
  }

  // --- 2. Everything else as the demo user, under row-level security -------
  const demo = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await demo.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (signInError) throw signInError;

  let { data: store, error: storeError } = await demo.from('stores').select('*').maybeSingle();
  if (storeError) throw storeError;
  if (!store) {
    const { data, error } = await demo
      .from('stores')
      .insert({ owner_id: demoUser.id, name: STORE_NAME, admin_pin: STAFF_PIN, terms_accepted_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    store = data;
    log('Created the demo store.');
  }
  // Belt and braces before the one service-role delete below: the store
  // this script is about to clear must be the one owned by the demo login.
  if (!store.id || store.owner_id !== demoUser.id) {
    throw new Error('Refusing to continue: the store found does not belong to the demo login.');
  }
  const storeId = store.id;

  const must = async (label, promise) => {
    const { data, error } = await promise;
    if (error) throw new Error(`${label}: ${error.message}`);
    return data;
  };

  // Unlock, refill, and lock again no matter what happened in between.
  await must(
    'unlock the demo store (has supabase/migrations/0020_demo_read_only.sql been run?)',
    admin.from('stores').update({ is_demo: false }).eq('id', storeId)
  );
  try {
    await refill({ demo, admin, storeId, must });
  } finally {
    await must('lock the demo store', admin.from('stores').update({ is_demo: true }).eq('id', storeId));
  }

  // Prove the lock took: the same login the public uses must now be unable
  // to change anything. A refused update comes back as zero rows changed
  // rather than as an error, so count them.
  const changed = await must('read-only check', demo.from('stores').update({ name: STORE_NAME }).eq('id', storeId).select('id'));
  const { error: insertError } = await demo.from('events').insert({ name: 'should be refused', start_date: '2026-01-01', end_date: '2026-01-01' });
  if (changed.length !== 0 || !insertError) {
    throw new Error('The demo store is NOT read-only — a write as the demo login went through.');
  }
  log('Locked: writes as the demo login are refused.');
  log(`Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}.`);
}

async function refill({ demo, admin, storeId, must }) {
  log('Clearing the demo store...');
  await must('clear saved reports', demo.from('saved_reports').delete().eq('store_id', storeId));
  await must('clear sales', demo.from('sales').delete().eq('store_id', storeId));
  await must('clear deals', demo.from('deals').delete().eq('store_id', storeId));
  await must('clear events', demo.from('events').delete().eq('store_id', storeId));
  await must('clear adjustments', admin.from('inventory_adjustments').delete().eq('store_id', storeId));
  await must('clear prints', demo.from('pieces').delete().eq('store_id', storeId).not('original_id', 'is', null));
  await must('clear pieces', demo.from('pieces').delete().eq('store_id', storeId));
  await must('clear cart', demo.from('store_carts').upsert({ store_id: storeId, items: [] }));

  await must(
    'store settings',
    demo
      .from('stores')
      .update({
        name: STORE_NAME,
        admin_pin: STAFF_PIN,
        require_admin_pin: false,
        low_stock_threshold: 3,
        enabled_payment_methods: ['cash', 'venmo', 'paypal'],
        pass_fee_to_buyer: false,
        venmo_username: 'JuniperLaneStudio-demo',
        paypal_me_username: 'JuniperLaneStudioDemo',
        cash_app_cashtag: null,
        fee_overrides: {},
      })
      .eq('id', storeId)
  );

  // --- 3. Dates: three past fairs, the latest one last weekend -------------
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // The most recent Saturday whose Sunday is already over, so the newest
  // fair is fully in the past whatever weekday this runs on.
  let lastSat = addDays(today, -2);
  while (lastSat.getDay() !== 6) lastSat = addDays(lastSat, -1);

  const fairs = [
    {
      key: 'riverbend',
      name: 'Riverbend Arts Festival',
      days: [addDays(lastSat, -56), addDays(lastSat, -55)],
      perDay: [15, 11],
      bundles: [1, 1],
      notes: 'Two-day riverside festival. Booth 14, corner spot near the food trucks.',
    },
    {
      key: 'maple',
      name: 'Maple Street Makers Market',
      days: [addDays(lastSat, -28)],
      perDay: [13],
      bundles: [1],
      notes: 'One-day street market. Smaller crowd, but lots of repeat buyers.',
    },
    {
      key: 'lakeside',
      name: 'Lakeside Art Fair',
      days: [lastSat, addDays(lastSat, 1)],
      perDay: [17, 12],
      bundles: [2, 1],
      notes: 'Juried show. Shared a double booth; best weekend of the season so far.',
    },
  ];
  const upcoming = {
    name: 'Downtown Art Walk',
    start: addDays(lastSat, 35),
    end: addDays(lastSat, 35),
    notes: 'Coming up — restock 5x7 prints and stickers before this one.',
  };
  // Originals that sold, and where.
  const originalSales = { market: ['riverbend', 0, 'venmo'], lake: ['maple', 0, 'paypal'], dunes: ['lakeside', 1, 'venmo'] };

  // --- 4. Work out the sales first, so stock levels can be made to agree ---
  const rng = makeRng(20261012);
  const sellable = [];
  for (const [origKey, sizes] of PRINTS) {
    for (const size of sizes) {
      const spec = PRINT_SIZES[size];
      sellable.push({ key: `${origKey}:${size}`, price: spec.price, stocked: spec.run, weight: spec.weight, sold: 0 });
    }
  }
  for (const g of SMALL_GOODS) sellable.push({ key: g.key, price: g.price, stocked: g.stocked, weight: g.weight, sold: 0 });
  const sellableByKey = new Map(sellable.map((s) => [s.key, s]));

  const adjustments = [
    { key: 'harbor:8x10', type: 'loss', quantity: 1, reason: 'Corner bent during booth setup', date: stamp(fairs[0].days[0], -45) },
    { key: 'sticker', type: 'loss', quantity: 4, reason: 'Rained on — left at the table edge', date: stamp(fairs[0].days[1], 200) },
    { key: 'postcards', type: 'donation', quantity: 2, reason: 'Donated to the elementary school art auction', date: stamp(addDays(lastSat, -40), 60) },
    { key: 'meadow:5x7', type: 'donation', quantity: 1, reason: "Gift for the fair organizer's raffle basket", date: stamp(fairs[1].days[0], 30) },
  ];

  const pickMethod = () => {
    const r = rng();
    return r < 0.4 ? 'cash' : r < 0.75 ? 'venmo' : 'paypal';
  };
  const pickItem = () => {
    const pool = sellable.filter((s) => s.key in TARGET_REMAINING || s.sold < s.stocked - 6);
    let r = rng() * pool.reduce((sum, s) => sum + s.weight, 0);
    for (const s of pool) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return pool[pool.length - 1];
  };

  const sales = []; // { key, sale_price, tip_amount, payment_method, sale_date, refunded_at, refund_reason }
  const pushSale = (key, price, method, date, extra = {}) => {
    sales.push({ key, sale_price: price, tip_amount: null, payment_method: method, sale_date: date, refunded_at: null, refund_reason: null, ...extra });
    if (sellableByKey.has(key) && !extra.refunded_at) sellableByKey.get(key).sold += 1;
  };

  const fiveBySevens = sellable.filter((s) => s.key.endsWith(':5x7'));
  for (const fair of fairs) {
    fair.days.forEach((day, dayIndex) => {
      let minute = 5 + Math.floor(rng() * 20);
      let bundlesLeft = fair.bundles[dayIndex];
      for (let i = 0; i < fair.perDay[dayIndex]; i++) {
        minute += 6 + Math.floor(rng() * 22);
        const method = pickMethod();
        const when = stamp(day, Math.min(minute, 355));
        // The "3 for $40" deal on 5x7 prints: three lines on one ticket,
        // each at a third of the bundle price.
        if (bundlesLeft > 0 && i % 5 === 2) {
          bundlesLeft -= 1;
          [13.33, 13.33, 13.34].forEach((price) => {
            pushSale(fiveBySevens[Math.floor(rng() * fiveBySevens.length)].key, price, method, when);
          });
          continue;
        }
        const item = pickItem();
        const tip = rng() < 0.22 ? [1, 2, 2, 3, 5][Math.floor(rng() * 5)] : null;
        pushSale(item.key, item.price, method, when, { tip_amount: tip });
      }
    });
  }
  for (const [origKey, [fairKey, dayIndex, method]] of Object.entries(originalSales)) {
    const fair = fairs.find((f) => f.key === fairKey);
    const orig = ORIGINALS.find((o) => o.key === origKey);
    pushSale(origKey, orig.price, method, stamp(fair.days[dayIndex], 150 + Math.floor(rng() * 120)), { tip_amount: null });
  }
  // One refund, so the Reports screen shows what a voided sale looks like.
  const refundedAt = stamp(fairs[1].days[0], 260);
  pushSale('canyon:8x10', 28, 'venmo', stamp(fairs[1].days[0], 215), {
    refunded_at: refundedAt,
    refund_reason: 'Customer changed their mind — swapped for a different print',
  });
  // A few between-fair sales out of the studio, so not everything belongs
  // to an event.
  [
    ['harbor:8x10', -47, 'paypal'],
    ['sticker', -47, 'paypal'],
    ['ridge:11x14', -19, 'venmo'],
    ['postcards', -12, 'cash'],
    ['meadow:8x10', -4, 'venmo'],
  ].forEach(([key, offset, method], i) => {
    pushSale(key, sellableByKey.get(key).price, method, stamp(addDays(lastSat, offset), 90 + i * 17));
  });
  sales.sort((a, b) => a.sale_date.localeCompare(b.sale_date));

  const adjustedByKey = new Map();
  for (const a of adjustments) adjustedByKey.set(a.key, (adjustedByKey.get(a.key) || 0) + a.quantity);
  for (const s of sellable) {
    const gone = s.sold + (adjustedByKey.get(s.key) || 0);
    if (s.key in TARGET_REMAINING) s.stocked = gone + TARGET_REMAINING[s.key];
    s.remaining = s.stocked - gone;
    if (s.remaining < 0) throw new Error(`Stock for ${s.key} went negative — adjust the starting quantities.`);
  }

  // --- 5. Inventory ---------------------------------------------------------
  log('Adding inventory...');
  const created = stamp(addDays(lastSat, -75), 0);
  const soldOriginalDate = (key) => sales.find((s) => s.key === key)?.sale_date ?? null;
  const originalRows = ORIGINALS.map((o, i) => {
    const sold = o.key in originalSales;
    const reserved = o.key === 'orchard';
    return {
      sku: `SKU-${String(i + 1).padStart(4, '0')}`,
      title: o.title,
      medium: o.medium,
      width_in: o.w,
      height_in: o.h,
      series: o.series,
      price: o.price,
      cost_basis: o.cost,
      status: sold ? 'sold' : reserved ? 'reserved' : 'available',
      type: 'original',
      quantity_remaining: sold ? 0 : 1,
      date_created: created,
      date_sold: sold ? soldOriginalDate(o.key) : null,
      sale_channel: sold ? 'show' : null,
      notes: reserved ? 'On hold for a collector until the end of the month.' : null,
      image_url: `${ART_BASE}/${o.art}.svg`,
    };
  });
  const insertedOriginals = await must('insert originals', demo.from('pieces').insert(originalRows).select('id, sku'));
  const pieceIdByKey = new Map();
  ORIGINALS.forEach((o, i) => {
    const sku = `SKU-${String(i + 1).padStart(4, '0')}`;
    pieceIdByKey.set(o.key, insertedOriginals.find((p) => p.sku === sku).id);
  });

  const titleByKey = new Map(ORIGINALS.map((o) => [o.key, o.title]));
  const typeByKey = new Map(ORIGINALS.map((o) => [o.key, 'original']));
  const otherRows = [];
  const otherKeys = [];
  for (const [origKey, sizes] of PRINTS) {
    const orig = ORIGINALS.find((o) => o.key === origKey);
    const origSku = `SKU-${String(ORIGINALS.indexOf(orig) + 1).padStart(4, '0')}`;
    for (const size of sizes) {
      const key = `${origKey}:${size}`;
      const s = sellableByKey.get(key);
      const title = `${orig.title} (${size} print)`;
      titleByKey.set(key, title);
      typeByKey.set(key, 'print');
      otherKeys.push(key);
      otherRows.push({
        sku: `${origSku}-${size.toUpperCase()}`,
        title,
        medium: 'Giclée print',
        series: orig.series,
        size,
        price: s.price,
        cost_basis: PRINT_SIZES[size].cost,
        status: 'available',
        type: 'print',
        original_id: pieceIdByKey.get(origKey),
        print_run_size: PRINT_SIZES[size].run,
        quantity_remaining: s.remaining,
        date_created: created,
        image_url: `${ART_BASE}/${orig.art}.svg`,
      });
    }
  }
  SMALL_GOODS.forEach((g, i) => {
    const s = sellableByKey.get(g.key);
    titleByKey.set(g.key, g.title);
    typeByKey.set(g.key, g.type);
    otherKeys.push(g.key);
    otherRows.push({
      sku: `SKU-${String(ORIGINALS.length + i + 1).padStart(4, '0')}`,
      title: g.title,
      medium: null,
      series: null,
      size: g.size,
      price: g.price,
      cost_basis: g.cost,
      status: 'available',
      type: g.type,
      original_id: null,
      print_run_size: null,
      quantity_remaining: s.remaining,
      date_created: created,
      image_url: `${ART_BASE}/${g.art}.svg`,
    });
  });
  const insertedOthers = await must('insert prints and small goods', demo.from('pieces').insert(otherRows).select('id, sku'));
  otherRows.forEach((row, i) => pieceIdByKey.set(otherKeys[i], insertedOthers.find((p) => p.sku === row.sku).id));

  // --- 6. Sales, loss/donation log, events, deals, saved reports ------------
  log('Adding sales history...');
  const saleRows = sales.map((s) => ({
    piece_id: pieceIdByKey.get(s.key),
    sale_price: s.sale_price,
    tip_amount: s.tip_amount,
    payment_method: s.payment_method,
    fee_amount: feeFor(s.sale_price, s.payment_method),
    sale_date: s.sale_date,
    refunded_at: s.refunded_at,
    refund_reason: s.refund_reason,
  }));
  const insertedSales = await must('insert sales', demo.from('sales').insert(saleRows).select('*'));
  const keyByPieceId = new Map(Array.from(pieceIdByKey.entries()).map(([k, id]) => [id, k]));

  await must(
    'insert adjustments',
    demo.from('inventory_adjustments').insert(
      adjustments.map((a) => ({
        piece_id: pieceIdByKey.get(a.key),
        type: a.type,
        quantity: a.quantity,
        reason: a.reason,
        adjustment_date: a.date,
      }))
    )
  );

  await must(
    'insert events',
    demo.from('events').insert([
      ...fairs.map((f) => ({ name: f.name, start_date: ymd(f.days[0]), end_date: ymd(f.days[f.days.length - 1]), notes: f.notes })),
      { name: upcoming.name, start_date: ymd(upcoming.start), end_date: ymd(upcoming.end), notes: upcoming.notes },
    ])
  );

  await must(
    'insert deals',
    demo.from('deals').insert([
      { name: '3 for $40 — 5x7 prints', type: 'bundle_price', trigger_condition: { count: 3 }, discount_value: 40, stackable: false, active: true, applies_to: { scope: 'size', type: 'print', sizes: ['5x7'] } },
      { name: 'Buy 3 stickers, get 1 free', type: 'bogo', trigger_condition: { count: 4 }, discount_value: 1, stackable: true, active: true, applies_to: { scope: 'type', type: 'sticker' } },
      { name: 'Collector special — 10% off 2+ originals', type: 'percent_off', trigger_condition: { count: 2 }, discount_value: 10, stackable: false, active: true, applies_to: { scope: 'type', type: 'original' } },
      { name: 'Holiday sale — $5 off 11x14 prints', type: 'amount_off', trigger_condition: { count: 1 }, discount_value: 5, stackable: false, active: false, applies_to: { scope: 'size', type: 'print', sizes: ['11x14'] } },
    ])
  );

  // Frozen snapshots for the two older fairs, built the same way
  // ReportsScreen's "Save this report" does. The newest fair is left
  // unsaved on purpose, so a visitor can try saving one themselves.
  const round = (n) => Math.round(n * 100) / 100;
  const reportNotes = {
    riverbend: 'Strong Saturday, slow Sunday after the rain. 5x7 bundles moved fast — bring more next year.',
    maple: 'Sold the Pine Lake original here. One print swapped and refunded. Worth doing again.',
  };
  const savedReports = fairs.slice(0, 2).map((f) => {
    const from = ymd(f.days[0]);
    const to = ymd(f.days[f.days.length - 1]);
    const inFair = insertedSales
      .filter((s) => !s.refunded_at && s.sale_date.slice(0, 10) >= from && s.sale_date.slice(0, 10) <= to)
      .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
    const gross = inFair.reduce((sum, s) => sum + Number(s.sale_price), 0);
    const fees = inFair.reduce((sum, s) => sum + Number(s.fee_amount), 0);
    const tips = inFair.reduce((sum, s) => sum + Number(s.tip_amount || 0), 0);
    const byType = new Map();
    for (const s of inFair) {
      const type = typeByKey.get(keyByPieceId.get(s.piece_id));
      const entry = byType.get(type) || { count: 0, gross: 0 };
      entry.count += 1;
      entry.gross = round(entry.gross + Number(s.sale_price));
      byType.set(type, entry);
    }
    return {
      title: `${f.name} — final numbers`,
      notes: reportNotes[f.key],
      event_name: f.name,
      from_date: from,
      to_date: to,
      snapshot: {
        summary: { count: inFair.length, gross: round(gross), fees: round(fees), tips: round(tips), net: round(gross - fees) },
        byType: Array.from(byType.entries())
          .map(([type, stats]) => ({ type, ...stats }))
          .sort((a, b) => b.gross - a.gross),
        sales: inFair.map((s) => ({
          id: s.id,
          title: titleByKey.get(keyByPieceId.get(s.piece_id)),
          sale_price: Number(s.sale_price),
          tip_amount: s.tip_amount === null ? null : Number(s.tip_amount),
          payment_method: s.payment_method,
          sale_date: s.sale_date,
          refunded_at: s.refunded_at,
        })),
      },
    };
  });
  await must('insert saved reports', demo.from('saved_reports').insert(savedReports));

  const activeSales = insertedSales.filter((s) => !s.refunded_at);
  const total = round(activeSales.reduce((sum, s) => sum + Number(s.sale_price), 0));
  log(
    `Done. ${originalRows.length + otherRows.length} pieces, ${insertedSales.length} sales ($${total} gross), ` +
      `${adjustments.length} loss/donation entries, ${fairs.length + 1} events, 4 deals, ${savedReports.length} saved reports.`
  );
  log(`Fairs: ${fairs.map((f) => `${f.name} (${ymd(f.days[0])})`).join(', ')}; upcoming: ${upcoming.name} (${ymd(upcoming.start)}).`);
}

main().catch((err) => {
  console.error(`[seed-demo] FAILED: ${err.message || err}`);
  process.exit(1);
});
