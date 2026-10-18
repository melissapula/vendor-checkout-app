// Settings for every new vendor's Stripe connected account. Stripe-owned
// pricing: the vendor pays Stripe's fees directly (the same 2.9% + 30c they
// paid as an Express account), Stripe bills the platform no Connect fees for
// the account, and Stripe rather than the platform covers negative balances.
// Onboarding is still Stripe-hosted via Account Links.
//
// The vendor gets the full Stripe dashboard because Stripe rejects the
// Express dashboard unless the platform pays fees and covers losses ("When
// `stripe_dashboard[type]=express`, your platform must collect fees and be
// liable for negative balances"). With the full dashboard a vendor can
// disconnect from the platform themselves.
//
// Who pays fees can only be set at creation — accounts made before this with
// the legacy `type: 'express'` keep `fees.payer = application_express`, and
// the platform keeps paying Connect fees for them. Don't add `type` here: the
// legacy types bring their own fee and loss settings.
//
// Kept free of Deno/npm imports so the Jest unit test in
// src/lib/connectAccount.test.ts can import it.
export const NEW_CONNECTED_ACCOUNT_PARAMS = {
  controller: {
    fees: { payer: 'account' },
    losses: { payments: 'stripe' },
    requirement_collection: 'stripe',
    stripe_dashboard: { type: 'full' },
  },
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
} as const;
