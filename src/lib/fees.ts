import { PaymentMethod } from '../types/database';

// 2026 rates from chrissy-art-inventory-app.md. PayPal quotes a range
// (2.99%–3.49% + $0.49 depending on payment type) — using the low end as a
// conservative estimate; not exact without knowing the buyer's funding source.
const FEE_RATES: Record<PaymentMethod, { rate: number; fixed: number }> = {
  square: { rate: 0.026, fixed: 0.1 },
  venmo: { rate: 0.019, fixed: 0.1 },
  paypal: { rate: 0.0299, fixed: 0.49 },
  cash: { rate: 0, fixed: 0 },
};

export function calculateFee(amount: number, method: PaymentMethod): number {
  const { rate, fixed } = FEE_RATES[method];
  if (amount <= 0) return 0;
  return Math.round((amount * rate + fixed) * 100) / 100;
}
