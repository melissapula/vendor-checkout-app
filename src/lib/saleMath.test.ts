// Unit tests for the per-sale money math used when CheckoutScreen records a
// sale (saleMath.ts). Pure functions: nothing is read from or written to the
// database.
import { apportionPerUnit, saleTotals } from './saleMath';

// Regression guard: these are the numbers CheckoutScreen's inline fee split
// produced before it moved into saleMath.ts.
describe('apportionPerUnit', () => {
  // Two-item cart: one $30 piece and two $10 pieces, $50 subtotal, $1.75 fee.
  test('gives a single-unit line its share of the fee', () => {
    expect(apportionPerUnit(1.75, 30, 50, 1)).toBe(1.05);
  });

  test('splits a multi-unit line share evenly per unit', () => {
    expect(apportionPerUnit(1.75, 20, 50, 2)).toBe(0.35);
  });

  test('a zero subtotal apportions no fee', () => {
    expect(apportionPerUnit(1.75, 0, 0, 1)).toBe(0);
  });
});

describe('saleTotals', () => {
  const base = { subtotal: 50, tip: 5, stripeFee: 1.75 };

  test('vendor absorbs Stripe fee, no platform fee', () => {
    expect(saleTotals({ ...base, platformFee: 0, passFeeToBuyer: false })).toEqual({ charged: 55, net: 48.25 });
  });

  test('Stripe fee passed to buyer, no platform fee', () => {
    expect(saleTotals({ ...base, platformFee: 0, passFeeToBuyer: true })).toEqual({ charged: 56.75, net: 50 });
  });

  test('vendor absorbs Stripe fee and the platform fee', () => {
    expect(saleTotals({ ...base, platformFee: 0.5, passFeeToBuyer: false })).toEqual({ charged: 55, net: 47.75 });
  });

  // The platform fee always comes out of the vendor's net, even when the
  // Stripe fee is passed on, so the buyer's total never includes it.
  test('Stripe fee passed to buyer, platform fee still absorbed by vendor', () => {
    expect(saleTotals({ ...base, platformFee: 0.5, passFeeToBuyer: true })).toEqual({ charged: 56.75, net: 49.5 });
  });
});
