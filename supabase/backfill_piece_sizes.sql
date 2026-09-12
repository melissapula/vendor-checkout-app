-- One-time manual step, run once after 0012_piece_size.sql — NOT a numbered
-- migration, since it's a best-effort data backfill (parsed from existing
-- SKU naming), not a schema change safe to replay blindly.
--
-- Order of operations:
--   1. Apply 0012_piece_size.sql (adds pieces.size).
--   2. Run PART 1 below and eyeball the preview — it changes nothing yet.
--   3. Run PART 2 to actually set pieces.size for the rows PART 1 showed you.
--   4. Run PART 3 (stickers) — see its comment; it needs a look at your real
--      sticker SKUs first since this file was written without visibility
--      into your live data, only the print-size convention already visible
--      in this repo's seed data (SKU suffixes like "-4X6", "-8X10GICLEE").
--   5. Run the final sanity-check query and eyeball anything still unmatched
--      — set those pieces' size by hand in the app (Inventory → edit piece).

-- ============================================================
-- PART 1 — preview only. Derives a print size from the SKU's trailing
-- "<width>X<height>" segment (e.g. "FSS-0001-4X6" -> "4x6",
-- "FSS-0002-8X10GICLEE" -> "8x10"). Run this first and check the
-- derived_size column looks right before touching any data.
-- ============================================================
select
  id,
  sku,
  title,
  type,
  lower(substring(sku from '-([0-9]{1,2}[Xx][0-9]{1,2})[A-Za-z]*$')) as derived_size
from pieces
where type = 'print'
  and size is null
  and sku ~ '-[0-9]{1,2}[Xx][0-9]{1,2}[A-Za-z]*$'
order by sku;

-- Prints that DIDN'T match the pattern above — check these manually, they
-- won't be touched by PART 2 (e.g. anything with a non-standard SKU suffix).
select id, sku, title
from pieces
where type = 'print'
  and size is null
  and sku !~ '-[0-9]{1,2}[Xx][0-9]{1,2}[A-Za-z]*$'
order by sku;

-- ============================================================
-- PART 2 — the actual update, same regex as the preview above. Only
-- touches print rows that matched.
--
-- 0003_enforce_tenant_isolation.sql's `pieces_set_store_id` trigger stamps
-- store_id from auth.uid() on every insert/update — which is null when run
-- from the SQL editor (no logged-in app user in this session), so it raises
-- "No store found for current user" on any plain UPDATE. Disable it for
-- just this one statement, then re-enable it immediately after — it must
-- stay ON for the app's own writes.
-- ============================================================
begin;
alter table pieces disable trigger pieces_set_store_id;

update pieces
set size = lower(substring(sku from '-([0-9]{1,2}[Xx][0-9]{1,2})[A-Za-z]*$'))
where type = 'print'
  and size is null
  and sku ~ '-[0-9]{1,2}[Xx][0-9]{1,2}[A-Za-z]*$';

alter table pieces enable trigger pieces_set_store_id;
commit;

-- ============================================================
-- PART 3 — stickers. This repo's memory says every original got a Small /
-- Large sticker variant, but the exact SKU suffix used for those (e.g.
-- "-S"/"-L", "-SM"/"-LG", "-STICKER-SMALL", something else) isn't visible
-- from this codebase — only your live Supabase data has the real SKUs.
--
-- Run this first to see what you're actually working with:
select id, sku, title, size
from pieces
where type = 'sticker'
order by sku;
--
-- Confirmed against the real data: sticker SKUs end in "-STICKSM" (Small)
-- or "-STICKLG" (Large) — e.g. "FSS-0001-STICKSM", "FSS-0001-STICKLG".
begin;
alter table pieces disable trigger pieces_set_store_id;

update pieces set size = 'Small' where type = 'sticker' and size is null and sku ilike '%-sticksm';
update pieces set size = 'Large' where type = 'sticker' and size is null and sku ilike '%-sticklg';

alter table pieces enable trigger pieces_set_store_id;
commit;

-- ============================================================
-- Final sanity check — anything still unmatched needs a manual size set in
-- the app (Inventory → edit piece → Size).
-- ============================================================
select type, count(*) filter (where size is null) as still_unmatched, count(*) as total
from pieces
where type in ('print', 'sticker')
group by type;
