// The public demo store ("Juniper Lane Studio") — a shared, throwaway
// account anyone can sign into to look around without creating their own.
// These credentials are deliberately public (shown on the sign-in screen),
// so the store is read-only for whoever signs in with them: the app refuses
// its writes up front (see src/lib/supabase.ts) and the database refuses
// them for real (supabase/migrations/0020_demo_read_only.sql). Only
// scripts/seed-demo.js can change it; that script also restores this
// password if someone changes it.
// Keep these two values in step with the same constants in that script and
// in supabase/functions/stripe-connect-onboarding/index.ts.
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'artfairdemo';

export function isDemoEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === DEMO_EMAIL;
}

export const DEMO_READ_ONLY_TITLE = 'The demo is read-only';
export const DEMO_READ_ONLY_MESSAGE =
  "You're exploring a shared demo store, so changes aren't saved. Create a free account to try this with your own inventory.";
