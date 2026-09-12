-- Named events with a date range (e.g. "Fall Festival, Sept 5-7 2026") so
-- Reports can automatically attribute a sale to whichever event its
-- sale_date falls inside, instead of relying on staff typing the same
-- show/venue name consistently at every checkout (the old `location` field
-- on sales/store_carts — left in place for old data, just no longer
-- written to going forward). Attribution is computed at report time by
-- comparing sale_date against [start_date, end_date], not stored on the
-- sale row, so entering a past event's dates retroactively documents
-- history too.
create table events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id),
  name text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index events_store_id_idx on events (store_id);

alter table events enable row level security;

create policy "select own events" on events for select using (store_id = current_store_id());
create policy "insert own events" on events for insert with check (store_id = current_store_id());
create policy "update own events" on events for update using (store_id = current_store_id()) with check (store_id = current_store_id());
create policy "delete own events" on events for delete using (store_id = current_store_id());

create trigger events_set_store_id before insert or update on events
  for each row execute function set_store_id();
