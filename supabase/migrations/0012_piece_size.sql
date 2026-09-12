-- Lets a piece carry a size label (e.g. "4x6", "8x10" for prints; "Small",
-- "Medium", "Large" for stickers) so deals can target a specific size
-- across every piece of art, instead of only "by type" or by listing exact
-- SKUs one at a time. See src/lib/deals.ts's 'size' AppliesTo scope.
alter table pieces add column size text;
