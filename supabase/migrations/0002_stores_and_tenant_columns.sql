-- Multi-tenant conversion, step 1 of 3 (see 0003 for the follow-up).
-- Purely additive: existing `using (true)` policies on pieces/sales/deals are
-- untouched here, so the current single-tenant app keeps working unmodified
-- while this ships. Run this, then sign up through the app as the first real
-- store owner (creates their auth user + stores row), then run
-- ../backfill_existing_data.sql, then apply 0003_enforce_tenant_isolation.sql.

create table stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  admin_pin text not null default '1234',
  created_at timestamptz not null default now()
);

alter table pieces add column store_id uuid references stores (id) on delete cascade;
alter table sales add column store_id uuid references stores (id) on delete cascade;
alter table deals add column store_id uuid references stores (id) on delete cascade;

create index pieces_store_id_idx on pieces (store_id);
create index sales_store_id_idx on sales (store_id);
create index deals_store_id_idx on deals (store_id);

alter table stores enable row level security;

create policy "owner select own store" on stores for select using (owner_id = auth.uid());
create policy "owner insert own store" on stores for insert with check (owner_id = auth.uid());
create policy "owner update own store" on stores for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- No delete policy in v1 — store deletion/account closure is out of scope.
