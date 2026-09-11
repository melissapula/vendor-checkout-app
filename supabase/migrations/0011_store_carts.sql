-- One shared "current cart" per store, replacing the local-only AsyncStorage
-- cart — every device signed into a store now sees the same cart, synced
-- live via Realtime, so e.g. a phone scanning an item shows up immediately
-- on the iPad running checkout. Deliberately one row per store (one active
-- sale at a time, by design) rather than a per-transaction/session concept.
create table store_carts (
  store_id uuid primary key references stores (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  location text not null default '',
  updated_at timestamptz not null default now()
);

alter table store_carts enable row level security;

create policy "select own store cart" on store_carts
  for select using (store_id = current_store_id());
create policy "insert own store cart" on store_carts
  for insert with check (store_id = current_store_id());
create policy "update own store cart" on store_carts
  for update using (store_id = current_store_id()) with check (store_id = current_store_id());

create or replace function touch_store_cart_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger store_carts_touch_updated_at before update on store_carts
  for each row execute function touch_store_cart_updated_at();

-- Required for postgres_changes subscriptions to fire for this table.
alter publication supabase_realtime add table store_carts;
