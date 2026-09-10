-- No refund/void flow existed at all — a recorded sale was permanent, with
-- no way to reverse a return/mistake short of hand-editing the DB. This adds
-- the minimum needed: a nullable refunded_at marker (null = active sale)
-- plus an optional reason, and a refund_sale() function that mirrors
-- finalize_sale's atomicity — marking the sale refunded and restoring the
-- piece's stock happen in one transaction, so a refund can't go half-
-- applied. For Stripe-paid sales (card/cash_app), the actual money-back
-- happens separately via the stripe-refund-sale Edge Function *before* this
-- runs (Postgres can't call the Stripe API directly) — see that function
-- for how the two are kept in sync.
alter table sales add column refunded_at timestamptz;
alter table sales add column refund_reason text;

-- No explicit `security invoker` — default for plpgsql functions, so this
-- runs as the calling user and stays subject to the same RLS policies as a
-- direct update would (see 0003_enforce_tenant_isolation.sql). A sale_id
-- belonging to a different store simply won't be found by the initial
-- select below, RLS-scoped like everything else — no manual store check
-- needed here.
create or replace function refund_sale(p_sale_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_sale sales;
  v_piece jsonb;
begin
  select * into v_sale from sales where id = p_sale_id;
  if not found then
    raise exception 'Sale not found';
  end if;
  if v_sale.refunded_at is not null then
    raise exception 'This sale was already refunded';
  end if;

  update sales set refunded_at = now() where id = p_sale_id;

  -- Each sale row represents exactly one unit (see finalize_sale's one-row-
  -- per-unit insert), so refunding restores exactly one unit. A piece
  -- deleted since the sale just leaves v_piece null — the sale still gets
  -- marked refunded either way.
  with upd as (
    update pieces p
    set quantity_remaining = p.quantity_remaining + 1,
        status = case when p.status = 'sold' then 'available' else p.status end
    where p.id = v_sale.piece_id
    returning p.*
  )
  select to_jsonb(upd) into v_piece from upd;

  return jsonb_build_object(
    'sale', (select to_jsonb(s) from sales s where s.id = p_sale_id),
    'piece', v_piece
  );
end;
$$;
