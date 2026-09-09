import { PaymentMethod } from '../types/database';

// 2026 rates. PayPal quotes a range (2.99%–3.49% + $0.49 depending on
// payment type) — using the low end as a conservative estimate; not exact
// without knowing the buyer's funding source. `card` and `cash_app` are both
// processed through Stripe on the vendor's connected account (Cash App Pay
// carries Stripe's standard 2.9%+$0.30 rate, same as card — PayPal can't go
// through Stripe for this app's US/Connect-platform setup, so it's still a
// self-reported `paypal.me` link). Once a real `card`/`cash_app` sale
// completes, CheckoutScreen uses Stripe's *actual* fee from the completed
// Checkout Session instead of this estimate; this table still applies as the
// real, final fee for the genuinely self-reported methods (venmo/paypal/cash).
const FEE_RATES: Record<PaymentMethod, { rate: number; fixed: number }> = {
  card: { rate: 0.029, fixed: 0.3 },
  venmo: { rate: 0.019, fixed: 0.1 },
  paypal: { rate: 0.0299, fixed: 0.49 },
  cash_app: { rate: 0.029, fixed: 0.3 },
  cash: { rate: 0, fixed: 0 },
};

export function calculateFee(amount: number, method: PaymentMethod): number {
  const { rate, fixed } = FEE_RATES[method];
  if (amount <= 0) return 0;
  return Math.round((amount * rate + fixed) * 100) / 100;
}
