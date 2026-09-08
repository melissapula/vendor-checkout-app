-- Run this in the Supabase SQL editor (or `supabase db push`) once the project exists.
-- Matches the schema drafted in chrissy-art-inventory-app.md.

create table pieces (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  title text not null,
  medium text,
  width_in numeric,
  height_in numeric,
  series text,
  price numeric not null,
  cost_basis numeric,
  status text not null default 'available' check (status in ('available', 'sold', 'reserved')),
  type text not null default 'original',
  original_id uuid references pieces (id),
  print_run_size integer,
  quantity_remaining integer not null default 1,
  date_created timestamptz not null default now(),
  date_sold timestamptz,
  sale_channel text check (sale_channel in ('show', 'online', 'studio')),
  notes text
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references pieces (id),
  sale_price numeric not null,
  tip_amount numeric,
  payment_method text not null check (payment_method in ('square', 'venmo', 'paypal', 'cash')),
  fee_amount numeric not null default 0,
  sale_date timestamptz not null default now(),
  square_payment_id text,
  location text
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('bundle_price', 'percent_off', 'amount_off', 'bogo')),
  trigger_condition jsonb not null,
  discount_value numeric not null,
  stackable boolean not null default false,
  active boolean not null default true,
  start_date timestamptz,
  end_date timestamptz,
  applies_to jsonb not null default '{"scope": "all"}'::jsonb
);

create index sales_piece_id_idx on sales (piece_id);
create index pieces_status_idx on pieces (status);
create index pieces_original_id_idx on pieces (original_id);

-- Single-tenant studio app: enable RLS but allow the anon key full access via a
-- shared PIN/passcode gate in the app itself, rather than per-row Supabase auth.
-- Revisit if a second device/user identity is ever needed.
alter table pieces enable row level security;
alter table sales enable row level security;
alter table deals enable row level security;

create policy "allow all to pieces" on pieces for all using (true) with check (true);
create policy "allow all to sales" on sales for all using (true) with check (true);
create policy "allow all to deals" on deals for all using (true) with check (true);
