import type { Store } from '../types/database';

// The Terms of Service version every vendor must have accepted. Version 1 is
// the original text; version 2 announced a platform fee, which was withdrawn
// before any fee was charged, so version 2 states no fee. Raising it shows
// every vendor AcceptTermsScreen again, and stripe-create-checkout refuses
// card sales until they accept.
// Keep in step with supabase/functions/_shared/terms.ts; terms.test.ts fails
// if the two differ.
export const CURRENT_TERMS_VERSION = 2;

// The demo store is skipped because its user can't write its own store row
// (supabase/migrations/0020_demo_read_only.sql), so it could never accept.
export function needsTermsAcceptance(store: Pick<Store, 'is_demo' | 'terms_version_accepted'>): boolean {
  return !store.is_demo && (store.terms_version_accepted ?? 0) < CURRENT_TERMS_VERSION;
}
