// The Terms of Service version a vendor must have accepted before
// stripe-create-checkout will take a card or Cash App sale for them.
// Version 2 added the platform fee (see _shared/platformFee.ts).
//
// Keep in step with src/lib/terms.ts; src/lib/terms.test.ts fails if the two
// differ. Kept free of Deno/npm imports so that test can import it.
export const CURRENT_TERMS_VERSION = 2;
