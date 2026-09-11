-- Lets a vendor attach a link to a piece (their own website, portfolio
-- page, Instagram post, etc.) so a printed label's QR code can point a
-- customer somewhere to "read more about it" instead of just encoding the
-- SKU for scan-to-cart.
alter table pieces add column info_url text;
