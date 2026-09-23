-- Gates new store creation behind a one-time invite code during the beta
-- period, so signup stays limited to vendors actually invited rather than
-- anyone who finds the URL. No RLS policies are granted on the table
-- itself — it's only ever touched through redeem_beta_code() below, so a
-- signed-in-but-storeless user (which is exactly the state anyone redeeming
-- a code is in — they haven't created a store yet) can't list the table
-- and see every other still-unredeemed code.
create table beta_invite_codes (
  code text primary key,
  used_by uuid references auth.users (id),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table beta_invite_codes enable row level security;

-- security definer (unlike this app's other RPCs, which deliberately stay
-- invoker-scoped to ride on RLS) since this must work for a user who has no
-- store yet, and therefore no store_id to scope any policy on.
create or replace function redeem_beta_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to redeem an invite code';
  end if;

  -- `used_by = auth.uid()` in the where clause (not just `is null`) makes
  -- this idempotent for the same user re-submitting after e.g. a network
  -- error on the create-store step right after redeeming — without it,
  -- their second attempt would wrongly fail as "already used".
  update beta_invite_codes
  set used_by = auth.uid(), used_at = now()
  where code = p_code and (used_by is null or used_by = auth.uid());

  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

grant execute on function redeem_beta_code(text) to authenticated;

-- To invite a vendor, add a code for them (not committed to source control —
-- run this by hand in the SQL editor whenever you want to hand out a new
-- one):
--   insert into beta_invite_codes (code) values ('SOME-CODE-HERE');
