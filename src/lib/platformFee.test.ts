// Unit tests for the platform-fee math shared with the Stripe Edge Functions
// (supabase/functions/_shared/platformFee.ts). Pure functions: nothing is
// read from or written to Stripe or the database.
import {
  parseExemptStoreIds,
  parsePlatformFeeRate,
  platformFeeCents,
  splitBalanceTransactionFees,
} from '../../supabase/functions/_shared/platformFee';

describe('parsePlatformFeeRate', () => {
  test('an unset secret means no fee', () => {
    expect(parsePlatformFeeRate(undefined)).toBe(0);
  });

  test('an empty secret means no fee', () => {
    expect(parsePlatformFeeRate('')).toBe(0);
  });

  test.each([
    ['0.01', 0.01],
    ['0', 0],
    ['0.05', 0.05],
  ])('accepts %s', (raw, expected) => {
    expect(parsePlatformFeeRate(raw)).toBe(expected);
  });

  // Fails closed: a typo must stop card checkout, not charge a guessed rate.
  test.each(['0.06', '-0.01', 'abc'])('throws on %s', (raw) => {
    expect(() => parsePlatformFeeRate(raw)).toThrow();
  });
});

describe('parseExemptStoreIds', () => {
  test('an unset secret exempts no one', () => {
    expect(parseExemptStoreIds(undefined).size).toBe(0);
  });

  test('an empty secret exempts no one', () => {
    expect(parseExemptStoreIds('').size).toBe(0);
  });

  test('trims spaces around each id', () => {
    expect([...parseExemptStoreIds(' store-a , store-b ')]).toEqual(['store-a', 'store-b']);
  });

  test('ignores a trailing comma', () => {
    expect([...parseExemptStoreIds('store-a,')]).toEqual(['store-a']);
  });
});

describe('platformFeeCents', () => {
  test('$25.00 at 1% is 25 cents', () => {
    expect(platformFeeCents(2500, 0.01)).toBe(25);
  });

  test('$0.49 at 1% rounds down to no fee', () => {
    expect(platformFeeCents(49, 0.01)).toBe(0);
  });

  test('$0.50 at 1% rounds half up to 1 cent', () => {
    expect(platformFeeCents(50, 0.01)).toBe(1);
  });

  // 3000 * 0.0045 is 13.4999... in floating point, not 13.5.
  test('an exact half cent rounds up despite floating-point error', () => {
    expect(platformFeeCents(3000, 0.0045)).toBe(14);
  });

  test('a zero rate is no fee', () => {
    expect(platformFeeCents(2500, 0)).toBe(0);
  });

  test('never goes below zero', () => {
    expect(platformFeeCents(-2500, 0.01)).toBe(0);
  });
});

describe('splitBalanceTransactionFees', () => {
  test('a charge with only Stripe fees has no platform fee', () => {
    expect(splitBalanceTransactionFees([{ type: 'stripe_fee', amount: 103 }])).toEqual({
      stripeFeeCents: 103,
      platformFeeCents: 0,
    });
  });

  test('separates the application fee from Stripe fees', () => {
    expect(
      splitBalanceTransactionFees([
        { type: 'stripe_fee', amount: 103 },
        { type: 'application_fee', amount: 25 },
      ])
    ).toEqual({ stripeFeeCents: 103, platformFeeCents: 25 });
  });

  test('counts every non-application fee type as Stripe', () => {
    expect(
      splitBalanceTransactionFees([
        { type: 'stripe_fee', amount: 103 },
        { type: 'tax', amount: 7 },
      ])
    ).toEqual({ stripeFeeCents: 110, platformFeeCents: 0 });
  });

  test('no breakdown yet gives nulls', () => {
    expect(splitBalanceTransactionFees(null)).toEqual({ stripeFeeCents: null, platformFeeCents: null });
  });
});
