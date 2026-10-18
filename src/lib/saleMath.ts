// Money math for recording one checkout as sale rows (CheckoutScreen's
// finalizeSale). Amounts are dollars.

// A fee is split across the cart's lines in proportion to each line's share
// of the subtotal, then evenly across that line's units, each step rounded to
// the cent. Used for both the Stripe fee and the platform fee.
export function apportionPerUnit(totalFee: number, lineAmount: number, subtotal: number, quantity: number): number {
  const lineFee = subtotal > 0 ? Math.round((lineAmount / subtotal) * totalFee * 100) / 100 : 0;
  return Math.round((lineFee / quantity) * 100) / 100;
}

export interface SaleTotalsInput {
  subtotal: number;
  tip: number;
  stripeFee: number;
  platformFee: number;
  passFeeToBuyer: boolean;
}

// "Pass fee to buyer" passes on only Stripe's fee. The platform fee always
// comes out of the vendor's net, so it never changes what the buyer pays.
export function saleTotals({ subtotal, tip, stripeFee, platformFee, passFeeToBuyer }: SaleTotalsInput): {
  charged: number;
  net: number;
} {
  return {
    charged: subtotal + tip + (passFeeToBuyer ? stripeFee : 0),
    net: subtotal - platformFee - (passFeeToBuyer ? 0 : stripeFee),
  };
}
