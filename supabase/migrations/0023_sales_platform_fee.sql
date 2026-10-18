-- Platform fee: MFP Apps takes an application fee on card and Cash App
-- sales (supabase/functions/_shared/platformFee.ts). It's recorded on its own
-- column rather than folded into fee_amount, so fee_amount stays Stripe's
-- processing fee and Reports can show the vendor both. Defaults to 0: every
-- existing sale, and every venmo/paypal/cash sale, had no platform fee.
alter table sales add column platform_fee_amount numeric not null default 0;

-- finalize_sale() from 0008_concurrency_fixes.sql, unchanged except that it
-- now inserts platform_fee_amount. coalesce to 0 so a web app deployed before
-- this migration, which doesn't send the field, still records its sales.
create or replace function finalize_sale(sale_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  inserted_sales jsonb;
  updated_pieces jsonb;
  v_short record;
begin
  perform 1 from pieces
  where id in (select (elem->>'piece_id')::uuid from jsonb_array_elements(sale_rows) elem)
  for update;

  select p.title, p.quantity_remaining, agg.qty
  into v_short
  from (
    select (elem->>'piece_id')::uuid as piece_id, count(*)::int as qty
    from jsonb_array_elements(sale_rows) elem
    group by piece_id
  ) agg
  join pieces p on p.id = agg.piece_id
  where agg.qty > p.quantity_remaining
  limit 1;

  if v_short.title is not null then
    raise exception 'Not enough stock for % — % left, % requested', v_short.title, v_short.quantity_remaining, v_short.qty;
  end if;

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
    insert into sales (piece_id, sale_price, tip_amount, payment_method, fee_amount, platform_fee_amount, sale_date, processor_payment_id, location)
    select
      (elem->>'piece_id')::uuid,
      (elem->>'sale_price')::numeric,
      (elem->>'tip_amount')::numeric,
      elem->>'payment_method',
      (elem->>'fee_amount')::numeric,
      coalesce((elem->>'platform_fee_amount')::numeric, 0),
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
