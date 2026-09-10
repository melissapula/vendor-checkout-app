-- CheckoutScreen used to decrement piece inventory (one UPDATE per cart
-- line) and then insert the sale rows as two separate round trips with no
-- rollback. A network drop or error between them permanently lost stock
-- with no matching sale record, even though the buyer's payment (already
-- captured for Stripe methods before this point) had gone through. This
-- collapses both writes into one function call — since the whole function
-- body runs in the caller's transaction, either everything commits or
-- nothing does.
--
-- Bonus: the quantity decrement is now computed in SQL from the *current*
-- row (quantity_remaining - qty), not from a client-held snapshot, so two
-- near-simultaneous sales of the same piece can no longer race each other
-- into an incorrect count the way PiecesContext.sellUnits's read-then-write
-- from local state could.
--
-- No explicit `security invoker` — that's the default for plpgsql
-- functions, so this still runs as the calling user and stays subject to
-- the same RLS policies and set_store_id triggers as a direct insert/update
-- would (see 0003_enforce_tenant_isolation.sql).
create or replace function finalize_sale(sale_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  inserted_sales jsonb;
  updated_pieces jsonb;
begin
  with agg as (
    select (elem->>'piece_id')::uuid as piece_id, count(*)::int as qty
    from jsonb_array_elements(sale_rows) elem
    group by piece_id
  ),
  upd as (
    update pieces p
    set quantity_remaining = greatest(0, p.quantity_remaining - agg.qty),
        status = case when greatest(0, p.quantity_remaining - agg.qty) = 0 then 'sold' else p.status end,
        date_sold = case when greatest(0, p.quantity_remaining - agg.qty) = 0 then now() else p.date_sold end
    from agg
    where p.id = agg.piece_id
    returning p.*
  )
  select coalesce(jsonb_agg(to_jsonb(upd)), '[]'::jsonb) into updated_pieces from upd;

  with ins as (
    insert into sales (piece_id, sale_price, tip_amount, payment_method, fee_amount, sale_date, processor_payment_id, location)
    select
      (elem->>'piece_id')::uuid,
      (elem->>'sale_price')::numeric,
      (elem->>'tip_amount')::numeric,
      elem->>'payment_method',
      (elem->>'fee_amount')::numeric,
      (elem->>'sale_date')::timestamptz,
      elem->>'processor_payment_id',
      elem->>'location'
    from jsonb_array_elements(sale_rows) elem
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into inserted_sales from ins;

  return jsonb_build_object('sales', inserted_sales, 'pieces', updated_pieces);
end;
$$;
