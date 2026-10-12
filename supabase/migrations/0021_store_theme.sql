-- Lets a store save its chosen color theme (Settings > Theme) to its own
-- row, so the choice follows the vendor to every device they sign in on
-- instead of living only in one browser.
--
-- Just the theme's name ("studio", "terracotta", ...) — the colors
-- themselves live in the app (src/lib/theme.ts, fed by the MFP design
-- system). Null means "never chosen", and the app falls back to whatever
-- this device last used, then to the default. An unrecognised name is
-- treated the same way, so retiring a theme later can't break a store.
--
-- Run this once in the Supabase SQL editor. The app works either way: until
-- the column exists it simply doesn't try to save the theme to the store.

alter table stores add column theme text;
