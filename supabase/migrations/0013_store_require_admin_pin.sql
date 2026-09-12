-- Lets a vendor turn off the staff PIN gate entirely (e.g. a solo seller
-- who doesn't need to stop anyone at the door) — tapping "Staff Access"
-- then goes straight to the admin view instead of prompting for a PIN.
-- Defaults to true so every existing store keeps requiring the PIN exactly
-- as before.
alter table stores add column require_admin_pin boolean not null default true;
