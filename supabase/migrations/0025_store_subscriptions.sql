-- Free and paid plans. Each store's plan lives in store_subscriptions, a
-- table vendors can read but never write: the Stripe billing webhook (service
-- role) keeps it current, and comps are inserted by hand in the SQL editor.
-- It is not a column on `stores` because "owner update own store" (0002)
-- lets a vendor write every column of their own store row, so a plan kept
-- there could be set to paid by the vendor.
--
-- Nothing changes yet. billing_settings.plans_enforced starts false, and
-- while it is false store_has_paid_plan() is true for every store, so the
-- restrictive policies below let everything through. Turning plans on is
-- one `update billing_settings set plans_enforced = true`; setting it back
-- to false is the kill switch.
--
-- (0022 was never used; this skips it on purpose.)
--
-- Run this once in the Supabase SQL editor BEFORE deploying the web app:
-- the app calls get_plan_state(), though it treats the function being
-- missing as "plans not enforced".

-- One row, enforced by the primary key that can only be true.
create table billing_settings (
  id boolean primary key default true check (id),
  plans_enforced boolean not null default false
);
insert into billing_settings default values;

alter table billing_settings enable row level security;
create policy "authenticated read billing settings" on billing_settings for select to authenticated using (true);

create table store_subscriptions (
  store_id uuid primary key references stores(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- Stripe's subscription status: trialing, active, past_due, canceled,
  -- unpaid, incomplete, incomplete_expired or paused.
  status text,
  price_interval text,
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Set by hand for stores that get the paid plan free. The webhook never
  -- touches it.
  comped boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table store_subscriptions enable row level security;
create policy "select own subscription" on store_subscriptions for select using (store_id = current_store_id());

-- No write policies above, so RLS already blocks vendor writes. These
-- revokes are a second lock that also makes a blocked write an error
-- (permission denied) rather than a silent "0 rows changed", which is what
-- tests/api/plan-schema.js checks for. The service role keeps its access.
revoke insert, update, delete on billing_settings, store_subscriptions from anon, authenticated;

-- True when the store may use paid features. `security definer` (like
-- is_demo_user() in 0020) so it reads billing_settings and
-- store_subscriptions regardless of the caller, and so the policies below
-- can call it. past_due counts as paid through Stripe's retry period.
create or replace function store_has_paid_plan(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not (select plans_enforced from billing_settings)
    or exists (select 1 from stores where id = p_store_id and is_demo)
    or exists (
      select 1 from store_subscriptions
      where store_id = p_store_id
        and (comped or status in ('trialing', 'active', 'past_due'))
    )
$$;

-- The calling vendor's plan, for the app (src/context/AuthContext.tsx). The
-- app never works out "is paid" itself; it uses is_paid from here.
create or replace function get_plan_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans_enforced', (select plans_enforced from billing_settings),
    'is_paid', store_has_paid_plan(current_store_id()),
    'status', s.status,
    'trial_end', s.trial_end,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', coalesce(s.cancel_at_period_end, false),
    'has_subscribed_before', s.stripe_subscription_id is not null
  )
  from (select 1) as one
  left join store_subscriptions s on s.store_id = current_store_id()
$$;

-- Paid features can't gain new rows on the free plan. Inserts only: rows a
-- store already has stay readable, editable and deletable after a
-- downgrade. `as restrictive` is ANDed with the existing per-store policies,
-- the same way 0020 locks the demo store. log_inventory_adjustment runs with
-- the caller's permissions (0009), so this covers it too.
do $$
declare
  t text;
begin
  foreach t in array array['deals', 'events', 'saved_reports', 'inventory_adjustments']
  loop
    execute format(
      'create policy "paid plan required (insert)" on %I as restrictive for insert with check ((select store_has_paid_plan(current_store_id())))', t);
  end loop;
end;
$$;
