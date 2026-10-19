// Unit tests for the Terms of Service version gate (terms.ts). Pure
// functions: nothing is read from or written to the database.
import { CURRENT_TERMS_VERSION, needsTermsAcceptance } from './terms';
import { CURRENT_TERMS_VERSION as SERVER_TERMS_VERSION } from '../../supabase/functions/_shared/terms';

describe('needsTermsAcceptance', () => {
  test('a store that has never recorded a version must accept', () => {
    expect(needsTermsAcceptance({ is_demo: false, terms_version_accepted: null })).toBe(true);
  });

  test('a store created before the version column existed must accept', () => {
    expect(needsTermsAcceptance({ is_demo: false })).toBe(true);
  });

  test('a store on version 1 must accept version 2', () => {
    expect(needsTermsAcceptance({ is_demo: false, terms_version_accepted: 1 })).toBe(true);
  });

  test('a store on version 2 is through', () => {
    expect(needsTermsAcceptance({ is_demo: false, terms_version_accepted: 2 })).toBe(false);
  });

  // The demo user can't write its own store, so it could never get past.
  test('the read-only demo store is never asked', () => {
    expect(needsTermsAcceptance({ is_demo: true, terms_version_accepted: null })).toBe(false);
  });
});

test('the app and the Edge Functions agree on the current version', () => {
  expect(CURRENT_TERMS_VERSION).toBe(2);
  expect(SERVER_TERMS_VERSION).toBe(CURRENT_TERMS_VERSION);
});
