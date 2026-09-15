-- Lets a vendor set the "running low" threshold used by Inventory's new
-- low-stock badge (pieces at or under this quantity get flagged, so they
-- know what to reorder — pairs with Import Print Order). Defaults to 3
-- rather than null so the feature is useful out of the box without a vendor
-- needing to know to configure it first.
alter table stores add column low_stock_threshold integer not null default 3;
