-- One-time manual fix, run once after backfill_piece_sizes.sql — MFP
-- Studio's 5 existing deals were all created before deals could scope by
-- size, so the 4 print bundle deals are scoped as {"type":"print",
-- "scope":"type"} — meaning today they'd match ANY two prints, not the
-- specific sizes named in the deal. This narrows each one to the sizes its
-- name actually describes. The postcard deal is untouched — postcards
-- don't vary by size.
--
-- Same trigger gotcha as pieces: deals_set_store_id (0003_enforce_tenant_
-- isolation.sql) stamps store_id from auth.uid() on every update, which is
-- null in the SQL editor — disable it for this one statement, then
-- re-enable it right after.

begin;
alter table deals disable trigger deals_set_store_id;

update deals set applies_to = '{"scope":"size","type":"print","sizes":["4x6","5x7"]}'::jsonb
where id = '7b3e9eaf-0f19-45c4-8bc1-07675b57cf90'; -- "1 4x6 and 1 5x7 for $25"

update deals set applies_to = '{"scope":"size","type":"print","sizes":["8x10","5x7"]}'::jsonb
where id = 'fb7c3dd0-7f16-40d7-b664-add2888e6499'; -- "1 8x10 and 1 5x7 for $50"

update deals set applies_to = '{"scope":"size","type":"print","sizes":["5x7"]}'::jsonb
where id = '2f7bc5f2-d899-4ecd-8ebf-0fd187b61fa7'; -- "2 5x7 prints for $35"

update deals set applies_to = '{"scope":"size","type":"print","sizes":["4x6"]}'::jsonb
where id = 'e8648f87-33d0-42b5-9dcc-9648450d2dc2'; -- "3 4x6 prints for $25"

alter table deals enable trigger deals_set_store_id;
commit;

-- Verify — should show the new "size" scope on the 4 print deals and the
-- untouched postcard deal:
select name, applies_to from deals order by name;
