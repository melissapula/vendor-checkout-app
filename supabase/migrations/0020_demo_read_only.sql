-- Makes the public demo store ("Juniper Lane Studio", see src/lib/demo.ts)
-- read-only at the database level. Its login is published on the sign-in
-- screen, so anyone can sign in as it; without this, any visitor could
-- rename pieces, delete sales or ring up fake ones, and the next visitor
-- would see the result. The app also refuses these writes up front (see
-- src/lib/supabase.ts) so visitors get a friendly message, but that check
-- runs in the visitor's own browser and can be bypassed — this one can't.
--
-- Run this once in the Supabase SQL editor, then run `npm run seed-demo`,
-- which is what actually marks the demo store (is_demo = true). Until
-- that script has run, this migration changes nothing for anyone.

alter table stores add column is_demo boolean not null default false;

-- True when the signed-in user owns a store flagged as the demo. Keyed on
-- the store rather than the login's email so it still holds if a visitor
-- changes the demo account's email. `security definer` so it can be used
-- inside policies on `stores` itself without those policies recursing.
create or replace function is_demo_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from stores where owner_id = auth.uid() and is_demo)
$$;

-- `as restrictive` policies are ANDed with the existing per-store ones
-- (which are permissive, i.e. ORed with each other), so these can only
-- ever take access away: a write now has to be to your own store AND not
-- come from the demo user. Reads are untouched. finalize_sale, refund_sale
-- and log_inventory_adjustment all run with the caller's permissions, so
-- they are covered by the same policies. The service role bypasses row
-- level security entirely, which is how scripts/seed-demo.js still resets
-- the store.
do $$
declare
  t text;
begin
  foreach t in array array[
    'stores', 'pieces', 'sales', 'deals', 'inventory_adjustments',
    'store_carts', 'events', 'saved_reports'
  ]
  loop
    execute format(
      'create policy "demo store is read-only (insert)" on %I as restrictive for insert with check (not (select is_demo_user()))', t);
    execute format(
      'create policy "demo store is read-only (update)" on %I as restrictive for update using (not (select is_demo_user()))', t);
    execute format(
      'create policy "demo store is read-only (delete)" on %I as restrictive for delete using (not (select is_demo_user()))', t);
  end loop;
end;
$$;
