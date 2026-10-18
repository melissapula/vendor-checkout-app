// The platform fee MFP Apps takes on card and Cash App sales, sent to Stripe
// as the Checkout Session's application_fee_amount on the vendor's direct
// charge. Two Supabase secrets control it:
//   PLATFORM_FEE_RATE              fraction of the fee base, 0 to 0.05
//                                  (unset = no fee)
//   PLATFORM_FEE_EXEMPT_STORE_IDS  comma-separated store ids that pay none
//
// The fee base is the subtotal after deals, never the tip or the Stripe fee
// passed to the buyer, so the buyer's total doesn't change.
//
// Kept free of Deno/npm imports so the Jest unit test in
// src/lib/platformFee.test.ts can import it.

const MAX_PLATFORM_FEE_RATE = 0.05;

// Fails closed: a rate that isn't a number in range throws, so card checkout
// returns an error instead of charging a guessed rate.
export function parsePlatformFeeRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > MAX_PLATFORM_FEE_RATE) {
    throw new Error(`PLATFORM_FEE_RATE must be a number from 0 to ${MAX_PLATFORM_FEE_RATE}`);
  }
  return rate;
}

export function parseExemptStoreIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '')
  );
}

// Snaps away floating-point error before rounding: 3000 * 0.0045 comes out
// as 13.4999..., which would otherwise round down.
const FLOAT_SNAP = 1e6;

// Half-up to whole cents. Stripe rejects a zero application fee, so callers
// leave the param off when this returns 0.
export function platformFeeCents(feeBaseCents: number, rate: number): number {
  const exactCents = Math.round(feeBaseCents * rate * FLOAT_SNAP) / FLOAT_SNAP;
  return Math.max(0, Math.round(exactCents));
}

// Stripe rejects refund_application_fee on a charge that had no application
// fee ("has no application fee to refund"), so a refund sends the flag only
// when the PaymentIntent carried one.
export function shouldRefundApplicationFee(applicationFeeAmount: number | null | undefined): boolean {
  return (applicationFeeAmount ?? 0) > 0;
}

export interface BalanceTransactionFeeDetail {
  type: string;
  amount: number;
}

// balance_transaction.fee is Stripe's fee and the application fee added
// together, so the sale row would overstate Stripe's fee once a platform fee
// exists. fee_details itemizes them.
export function splitBalanceTransactionFees(feeDetails: BalanceTransactionFeeDetail[] | null): {
  stripeFeeCents: number | null;
  platformFeeCents: number | null;
} {
  if (!feeDetails) return { stripeFeeCents: null, platformFeeCents: null };
  let stripeFeeCents = 0;
  let platformFeeCents = 0;
  for (const detail of feeDetails) {
    if (detail.type === 'application_fee') platformFeeCents += detail.amount;
    else stripeFeeCents += detail.amount;
  }
  return { stripeFeeCents, platformFeeCents };
}
