-- EXAMPLE deals — placeholders to exercise the deals engine, not Chrissy's
-- real picks. She still needs to "define a few real starter bundles/deals"
-- (see the Open/Next Steps list in chrissy-art-inventory-app.md). Replace or
-- delete these before a real show.
--
-- Run AFTER 0001_init.sql (and seed.sql, though order vs. that one doesn't
-- matter — deals don't reference pieces by id).

insert into deals (name, type, trigger_condition, discount_value, stackable, active, applies_to) values
  (
    '3+ Prints — 15% Off',
    'percent_off',
    '{"count": 3}'::jsonb,
    15,
    false,
    true,
    '{"scope": "type", "type": "print"}'::jsonb
  ),
  (
    'Buy 3 Stickers, Get 1 Free',
    'bogo',
    '{"count": 4}'::jsonb,
    1,
    true,
    true,
    '{"scope": "type", "type": "sticker"}'::jsonb
  ),
  (
    '2 Postcards for $8',
    'bundle_price',
    '{"count": 2}'::jsonb,
    8,
    false,
    true,
    '{"scope": "type", "type": "postcard"}'::jsonb
  );
