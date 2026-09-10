-- Losses/donations: a piece can leave inventory without a sale (damaged,
-- lost, given away). Until now there was no way to record that — the only
-- way to reflect it in stock was quietly editing quantity_remaining by
-- hand in the piece form, with no record of why. This adds an append-only
-- log, alongside a function that decrements stock and inserts the log row
-- atomically — same reasoning and same "lock, check, then write" pattern
-- as finalize_sale/refund_sale (0005/0008): a concurrent sale and a
-- concurrent adjustment against the same piece must not both succeed past
-- what's actually in stock.
create table inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id),
  piece_id uuid not null references pieces (id),
  type text not null check (type in ('loss', 'donation')),
  quantity integer not null check (quantity > 0),
  reason text,
  adjustment_date timestamptz not null default now()
);

create index inventory_adjustments_piece_id_idx on inventory_adjustments (piece_id);

alter table inventory_adjustments enable row level security;

create policy "select own adjustments" on inventory_adjustments for select using (store_id = current_store_id());
create policy "insert own adjustments" on inventory_adjustments for insert with check (store_id = current_store_id());
-- No update/delete policy — like sales, this is an audit log: fix a
-- mistake by logging a correction, not by editing history.

create trigger inventory_adjustments_set_store_id before insert on inventory_adjustments
  for each row execute function set_store_id();

-- No explicit `security invoker` — default for plpgsql functions, so this
-- runs as the calling user and stays subject to the RLS policies and
-- set_store_id triggers above (see 0003_enforce_tenant_isolation.sql).
create or replace function log_inventory_adjustment(p_piece_id uuid, p_type text, p_quantity integer, p_reason text)
returns jsonb
language plpgsql
as $$
declare
  v_piece pieces;
  v_adjustment inventory_adjustments;
begin
  if p_type not in ('loss', 'donation') then
    raise exception 'Invalid adjustment type: %', p_type;
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive number';
  end if;

  select * into v_piece from pieces where id = p_piece_id for update;
  if not found then
    raise exception 'Piece not found';
  end if;
  if v_piece.quantity_remaining < p_quantity then
    raise exception 'Not enough stock for % — % left, % requested', v_piece.title, v_piece.quantity_remaining, p_quantity;
  end if;

  update pieces
  set quantity_remaining = quantity_remaining - p_quantity
  where id = p_piece_id
  returning * into v_piece;

  insert into inventory_adjustments (piece_id, type, quantity, reason)
  values (p_piece_id, p_type, p_quantity, nullif(trim(p_reason), ''))
  returning * into v_adjustment;

  return jsonb_build_object('piece', to_jsonb(v_piece), 'adjustment', to_jsonb(v_adjustment));
end;
$$;
