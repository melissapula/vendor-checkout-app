-- Two concurrency bugs found on re-audit of 0005/0007, both real races
-- under actual multi-device/slow-network use, not just theoretical:
--
-- finalize_sale() clamped the decrement to 0 with greatest(0, ...) but
-- never refused a sale that requested more than was actually in stock —
-- two near-simultaneous checkouts for the last unit of a piece could both
-- succeed and both insert a sale row, since nothing stopped the second one.
--
-- refund_sale() checked `refunded_at is not null` via a plain select, then
-- did an *unconditional* update — two overlapping refund_sale() calls for
-- the same sale_id (a double-click before the UI re-renders to disable the
-- button, or two devices) could both pass the check before either
-- committed, so both would increment the piece's stock for one refund.

-- Lock the involved piece rows before checking sufficiency, so a second
-- concurrent finalize_sale() touching the same piece(s) blocks on the lock
-- here rather than reading the same pre-decrement quantity_remaining and
-- proceeding anyway. Raising on a shortfall aborts the whole batch (all
-- sale_rows), matching what CheckoutScreen's own preflight check already
-- tells the buyer — this is what actually enforces it atomically, since
-- that preflight is a separate query with its own race window before this
-- function ever runs.
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

-- Fold the "already refunded" check into the UPDATE's own WHERE clause
-- instead of a separate select-then-check-then-update. A concurrent second
-- call blocks on this statement's row lock, then re-evaluates `refunded_at
-- is null` against the now-committed row and correctly updates nothing —
-- the race is closed by Postgres's own row locking, not by application code.
create or replace function refund_sale(p_sale_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_sale sales;
  v_piece jsonb;
begin
  update sales
  set refunded_at = now()
  where id = p_sale_id and refunded_at is null
  returning * into v_sale;

  if not found then
    if exists (select 1 from sales where id = p_sale_id) then
      raise exception 'This sale was already refunded';
    else
      raise exception 'Sale not found';
    end if;
  end if;

  with upd as (
    update pieces p
    set quantity_remaining = p.quantity_remaining + 1,
        status = case when p.status = 'sold' then 'available' else p.status end
    where p.id = v_sale.piece_id
    returning p.*
  )
  select to_jsonb(upd) into v_piece from upd;

  return jsonb_build_object('sale', to_jsonb(v_sale), 'piece', v_piece);
end;
$$;
