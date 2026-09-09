-- Multi-tenant conversion, step 3 of 3. Run only after 0002 has been applied
-- AND backfill_existing_data.sql has been run against real data — this
-- migration makes store_id required and locks RLS down to one store's rows
-- per authenticated owner, so any row still missing a store_id at this point
-- will fail the NOT NULL constraint below.

-- These three ALTERs fail loudly if backfill_existing_data.sql hasn't been
-- run (or missed rows) — that's the intended guard, don't skip it.
alter table pieces alter column store_id set not null;
alter table sales alter column store_id set not null;
alter table deals alter column store_id set not null;

-- SKU uniqueness was global; two independent stores may each want e.g. "0001".
alter table pieces drop constraint pieces_sku_key;
alter table pieces add constraint pieces_store_sku_unique unique (store_id, sku);

-- Stamp store_id server-side on every write, unconditionally overwriting
-- whatever the client sent — so a stale/buggy/malicious client payload can't
-- set another tenant's store_id even before the RLS `with check` below would
-- catch it.
create or replace function current_store_id()
returns uuid language sql stable as $$
  select id from stores where owner_id = auth.uid()
$$;

create or replace function set_store_id()
returns trigger language plpgsql as $$
begin
  new.store_id := current_store_id();
  if new.store_id is null then
    raise exception 'No store found for current user';
  end if;
  return new;
end;
$$;

create trigger pieces_set_store_id before insert or update on pieces
  for each row execute function set_store_id();
create trigger sales_set_store_id before insert or update on sales
  for each row execute function set_store_id();
create trigger deals_set_store_id before insert or update on deals
  for each row execute function set_store_id();

drop policy "allow all to pieces" on pieces;
drop policy "allow all to sales" on sales;
drop policy "allow all to deals" on deals;

create policy "select own pieces" on pieces for select using (store_id = current_store_id());
create policy "insert own pieces" on pieces for insert with check (store_id = current_store_id());
create policy "update own pieces" on pieces for update using (store_id = current_store_id()) with check (store_id = current_store_id());
create policy "delete own pieces" on pieces for delete using (store_id = current_store_id());

create policy "select own sales" on sales for select using (store_id = current_store_id());
create policy "insert own sales" on sales for insert with check (store_id = current_store_id());
create policy "update own sales" on sales for update using (store_id = current_store_id()) with check (store_id = current_store_id());
create policy "delete own sales" on sales for delete using (store_id = current_store_id());

create policy "select own deals" on deals for select using (store_id = current_store_id());
create policy "insert own deals" on deals for insert with check (store_id = current_store_id());
create policy "update own deals" on deals for update using (store_id = current_store_id()) with check (store_id = current_store_id());
create policy "delete own deals" on deals for delete using (store_id = current_store_id());
