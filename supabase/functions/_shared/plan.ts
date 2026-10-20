// The payment methods only a store on the paid plan may take, in the app's
// names, and the Stripe payment method types they map to. The plan itself
// is checked in the database (store_has_paid_plan, migration 0025).
//
// Keep PAID_ONLY_PAYMENT_METHODS in step with src/lib/plan.ts;
// src/lib/plan.test.ts fails if the two differ. Kept free of Deno/npm
// imports so that test can import it.
export const PAID_ONLY_PAYMENT_METHODS = ['card', 'cash_app'];
export const STRIPE_PAYMENT_METHOD_TYPES_PAID = ['card', 'cashapp'];
