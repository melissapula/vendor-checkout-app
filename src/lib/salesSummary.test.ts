// Unit tests for the Reports summary box numbers (salesSummary.ts). Net is
// what the vendor keeps: gross minus Stripe's fee minus the MFP Apps platform
// fee. Refunded sales count toward none of it. Rows from before the platform
// fee have platform_fee_amount 0 (the column's default), so their totals are
// unchanged.
import type { Sale } from '../types/database';
import { summarizeSales } from './salesSummary';

function sale(fields: Partial<Sale>): Sale {
  return {
    sale_price: 0,
    tip_amount: null,
    fee_amount: 0,
    platform_fee_amount: 0,
    refunded_at: null,
    ...fields,
  } as Sale;
}

describe('summarizeSales', () => {
  test('no sales gives all zeros', () => {
    expect(summarizeSales([])).toEqual({ gross: 0, fees: 0, platformFees: 0, tips: 0, net: 0, count: 0 });
  });

  test('net subtracts both the Stripe fee and the platform fee', () => {
    const result = summarizeSales([
      sale({ sale_price: 25, fee_amount: 1.05, platform_fee_amount: 0.25, tip_amount: 5 }),
      sale({ sale_price: 10, fee_amount: 0.59, platform_fee_amount: 0.1 }),
    ]);

    expect(result.gross).toBe(35);
    expect(result.fees).toBeCloseTo(1.64);
    expect(result.platformFees).toBeCloseTo(0.35);
    expect(result.tips).toBe(5);
    expect(result.net).toBeCloseTo(33.01);
    expect(result.count).toBe(2);
  });

  test('refunded sales are left out of every total, both fees included', () => {
    const result = summarizeSales([
      sale({ sale_price: 25, fee_amount: 1.05, platform_fee_amount: 0.25 }),
      sale({ sale_price: 40, fee_amount: 1.46, platform_fee_amount: 0.4, tip_amount: 3, refunded_at: '2026-10-18T12:00:00Z' }),
    ]);

    expect(result).toEqual({ gross: 25, fees: 1.05, platformFees: 0.25, tips: 0, net: 23.7, count: 1 });
  });

  test('sales from before the platform fee give platformFees 0 and an unchanged net', () => {
    const result = summarizeSales([
      sale({ sale_price: 20, fee_amount: 0.88 }),
      sale({ sale_price: 15, payment_method: 'cash' }),
    ]);

    expect(result.platformFees).toBe(0);
    expect(result.net).toBeCloseTo(34.12);
  });
});
