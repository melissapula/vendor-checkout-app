-- One-time manual step, run once between 0002 and 0003 — NOT a numbered
-- migration, since it depends on a real store already existing (created by
-- signing up through the app as the first real owner) rather than being
-- safe to replay automatically.
--
-- Order of operations:
--   1. Apply 0002_stores_and_tenant_columns.sql
--   2. Sign up in the app as the studio that owns all the *existing* rows in
--      pieces/sales/deals (this creates their auth user + one `stores` row).
--   3. Run this script. It only proceeds while exactly one store exists —
--      it's meant for the one-time single-tenant-to-multi-tenant cutover,
--      not as a general "assign orphaned rows" tool.
--   4. Apply 0003_enforce_tenant_isolation.sql.

do $$
declare
  target_store_id uuid;
  store_count int;
begin
  select count(*) into store_count from stores;
  if store_count <> 1 then
    raise exception 'Expected exactly one store to backfill into, found %. This script is only for the initial single-tenant cutover.', store_count;
  end if;

  select id into target_store_id from stores limit 1;

  update pieces set store_id = target_store_id where store_id is null;
  update sales set store_id = target_store_id where store_id is null;
  update deals set store_id = target_store_id where store_id is null;
end $$;

-- Sanity checks — run these and eyeball the results before applying 0003.
select count(*) filter (where store_id is null) as pieces_still_unassigned from pieces;
select count(*) filter (where store_id is null) as sales_still_unassigned from sales;
select count(*) filter (where store_id is null) as deals_still_unassigned from deals;
