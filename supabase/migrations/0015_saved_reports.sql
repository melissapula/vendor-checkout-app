-- Lets an admin freeze a report's numbers under a title + notes so it stays
-- available for reference later (e.g. "how did the Fall Festival do last
-- year") even if the underlying sales are later refunded, edited, or
-- deleted. `snapshot` holds the computed totals/breakdown/line items as of
-- save time — a saved report is never recomputed from live data once made.
create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id),
  title text not null,
  notes text,
  event_name text,
  from_date date,
  to_date date,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index saved_reports_store_id_idx on saved_reports (store_id);

alter table saved_reports enable row level security;

create policy "select own saved_reports" on saved_reports for select using (store_id = current_store_id());
create policy "insert own saved_reports" on saved_reports for insert with check (store_id = current_store_id());
create policy "update own saved_reports" on saved_reports for update using (store_id = current_store_id()) with check (store_id = current_store_id());
create policy "delete own saved_reports" on saved_reports for delete using (store_id = current_store_id());

create trigger saved_reports_set_store_id before insert or update on saved_reports
  for each row execute function set_store_id();
