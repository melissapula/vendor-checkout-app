// Unit tests for the processing-fee estimate (fees.ts). Pure functions:
// nothing is read from or written to the database.
import { calculateFee, feeRateFor } from './fees';

describe('calculateFee with the default rates', () => {
  test.each([
    ['card', 3.2], // 100 * 2.9% + $0.30
    ['venmo', 2.0], // 100 * 1.9% + $0.10
    ['paypal', 3.48], // 100 * 2.99% + $0.49
    ['cash_app', 3.2], // same Stripe rate as card
    ['cash', 0],
  ] as const)('%s on $100 is $%d', (method, expected) => {
    expect(calculateFee(100, method)).toBe(expected);
  });

  test('rounds to the nearest cent', () => {
    expect(calculateFee(10.55, 'card')).toBe(0.61); // 0.60595
    expect(calculateFee(19.99, 'paypal')).toBe(1.09); // 1.087701
  });

  test('a zero or negative amount has no fee, not just the fixed part', () => {
    expect(calculateFee(0, 'card')).toBe(0);
    expect(calculateFee(-5, 'paypal')).toBe(0);
  });
});

describe('per-store overrides', () => {
  test('an override replaces the default rate for its method', () => {
    expect(calculateFee(100, 'card', { card: { rate: 0.03, fixed: 0 } })).toBe(3);
  });

  test('an override for another method leaves this one on the default', () => {
    expect(calculateFee(100, 'card', { venmo: { rate: 0, fixed: 0 } })).toBe(3.2);
  });

  test('null or missing overrides fall back to the defaults', () => {
    expect(calculateFee(100, 'card', null)).toBe(3.2);
    expect(calculateFee(100, 'card', undefined)).toBe(3.2);
  });

  test('feeRateFor returns the override when set, the default otherwise', () => {
    const custom = { rate: 0.01, fixed: 0.05 };
    expect(feeRateFor('venmo', { venmo: custom })).toBe(custom);
    expect(feeRateFor('venmo', {})).toEqual({ rate: 0.019, fixed: 0.1 });
  });
});
