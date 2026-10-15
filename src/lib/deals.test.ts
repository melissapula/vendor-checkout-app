// Unit tests for the deals engine (deals.ts). Expected values come from the
// rules in deals.ts's comments: bundle/bogo repeat per complete group and
// use the cheapest units, percent/amount off apply to every eligible unit
// once the threshold is met, and the biggest non-stackable discount wins a
// contested piece.
import type { Deal, Piece } from '../types/database';
import type { CartItem } from './cartItem';
import { evaluateDeals, type AppliesTo } from './deals';

const NOW = new Date('2026-10-15T12:00:00Z');

function piece(id: string, price: number, fields: Partial<Piece> = {}): Piece {
  return { id, sku: id, price, type: 'print', size: null, series: null, ...fields } as Piece;
}

function line(p: Piece, quantity = 1, overridePrice?: number | null): CartItem {
  return { piece: p, quantity, overridePrice };
}

function deal(
  type: Deal['type'],
  count: number,
  discountValue: number,
  fields: Partial<Omit<Deal, 'applies_to'>> & { applies_to?: AppliesTo } = {},
): Deal {
  const { applies_to = { scope: 'all' }, ...rest } = fields;
  return {
    id: `${type}-${count}-${discountValue}`,
    store_id: 'store',
    name: type,
    type,
    trigger_condition: { count },
    discount_value: discountValue,
    stackable: false,
    active: true,
    start_date: null,
    end_date: null,
    applies_to,
    ...rest,
  };
}

describe('evaluateDeals by deal type', () => {
  test('bundle: charges the bundle price once per complete group', () => {
    const items = [line(piece('a', 20), 7)];
    const result = evaluateDeals(items, [deal('bundle_price', 3, 50)], NOW);

    // Two groups of 3 at $60 each become $50: $10 saved per group. The 7th unit pays full price.
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].reps).toBe(2);
    expect(result.totalDiscount).toBe(20);
  });

  test('bundle: groups the cheapest units first', () => {
    const items = [line(piece('a', 20), 3), line(piece('b', 30))];
    const result = evaluateDeals(items, [deal('bundle_price', 3, 50)], NOW);

    // The bundle takes the three $20 units, not the $30 one.
    expect(result.totalDiscount).toBe(10);
  });

  test('percent: applies to every eligible unit once the threshold is met', () => {
    const items = [line(piece('a', 15), 3)];
    const result = evaluateDeals(items, [deal('percent_off', 2, 20)], NOW);

    // 3 units qualify with a threshold of 2, so all 3 are discounted: 20% of $45.
    expect(result.totalDiscount).toBe(9);
  });

  test('percent: does nothing below the threshold', () => {
    const items = [line(piece('a', 15))];
    const result = evaluateDeals(items, [deal('percent_off', 2, 20)], NOW);

    expect(result.applied).toEqual([]);
    expect(result.totalDiscount).toBe(0);
  });

  test('percent: rounds the discount to the cent', () => {
    const items = [line(piece('a', 9.99), 3)];
    const result = evaluateDeals(items, [deal('percent_off', 1, 10)], NOW);

    expect(result.totalDiscount).toBe(3); // 10% of $29.97 = $2.997
  });

  test('amount: takes the fixed amount off the eligible total', () => {
    const items = [line(piece('a', 10), 2)];
    const result = evaluateDeals(items, [deal('amount_off', 2, 5)], NOW);

    expect(result.totalDiscount).toBe(5);
  });

  test('amount: never takes off more than the eligible total', () => {
    const items = [line(piece('a', 10), 2)];
    const result = evaluateDeals(items, [deal('amount_off', 2, 50)], NOW);

    expect(result.totalDiscount).toBe(20);
  });

  test('bogo: the cheapest unit in the cycle is free', () => {
    const items = [line(piece('a', 16)), line(piece('b', 12)), line(piece('c', 10)), line(piece('d', 14))];
    // Buy 3 get 1 free: a cycle of 4, 1 free.
    const result = evaluateDeals(items, [deal('bogo', 4, 1)], NOW);

    expect(result.applied[0].reps).toBe(1);
    expect(result.totalDiscount).toBe(10);
  });

  test('bogo: an incomplete cycle gets nothing free', () => {
    const items = [line(piece('a', 10), 3)];
    const result = evaluateDeals(items, [deal('bogo', 4, 1)], NOW);

    expect(result.applied).toEqual([]);
  });
});

describe('evaluateDeals date window', () => {
  const items = [line(piece('a', 20))];

  test.each([
    ['has not started yet', { start_date: '2026-10-16T00:00:00Z' }],
    ['has already ended', { end_date: '2026-10-15T11:59:59Z' }],
  ])('skips a deal that %s', (_label, dates) => {
    const result = evaluateDeals(items, [deal('amount_off', 1, 5, dates)], NOW);

    expect(result.applied).toEqual([]);
  });

  test('applies a deal whose window includes now', () => {
    const dates = { start_date: '2026-10-01T00:00:00Z', end_date: '2026-10-31T00:00:00Z' };
    const result = evaluateDeals(items, [deal('amount_off', 1, 5, dates)], NOW);

    expect(result.totalDiscount).toBe(5);
  });
});

describe('evaluateDeals size scope', () => {
  test('discounts only pieces of the scoped type and size', () => {
    const items = [
      line(piece('print-4x6', 10, { size: '4x6' })),
      line(piece('print-8x10', 30, { size: '8x10' })),
      line(piece('sticker-4x6', 5, { type: 'sticker', size: '4x6' })),
      line(piece('print-no-size', 40)),
    ];
    const applies_to: AppliesTo = { scope: 'size', type: 'print', sizes: ['4x6'] };
    const result = evaluateDeals(items, [deal('percent_off', 1, 50, { applies_to })], NOW);

    expect(result.totalDiscount).toBe(5);
    expect([...result.discountByPieceId.keys()]).toEqual(['print-4x6']);
  });

  test('a mixed-size deal counts every listed size toward the threshold', () => {
    const items = [line(piece('p57', 15, { size: '5x7' })), line(piece('p810', 25, { size: '8x10' }))];
    const applies_to: AppliesTo = { scope: 'size', type: 'print', sizes: ['5x7', '8x10'] };
    const result = evaluateDeals(items, [deal('bundle_price', 2, 30, { applies_to })], NOW);

    expect(result.totalDiscount).toBe(10);
  });
});

describe('evaluateDeals conflicts', () => {
  test('the bigger non-stackable discount wins a contested piece, even across different scopes', () => {
    const items = [line(piece('print', 20, { size: '4x6' }), 2)];
    const byType = deal('percent_off', 1, 10, { name: 'by type', applies_to: { scope: 'type', type: 'print' } });
    const bySize = deal('amount_off', 1, 5, {
      name: 'by size',
      applies_to: { scope: 'size', type: 'print', sizes: ['4x6'] },
    });
    // by type saves $4 (10% of $40); by size saves $5.
    const result = evaluateDeals(items, [byType, bySize], NOW);

    expect(result.applied.map((a) => a.deal.name)).toEqual(['by size']);
    expect(result.overridden.map((a) => a.deal.name)).toEqual(['by type']);
    expect(result.totalDiscount).toBe(5);
  });
});

describe('evaluateDeals per-piece split', () => {
  test('spreads each deal across its pieces by unit count, adding up to the total', () => {
    const items = [line(piece('a', 10)), line(piece('b', 30), 2)];
    const result = evaluateDeals(items, [deal('percent_off', 1, 10)], NOW);

    // $7 off across 3 units: 'a' has 1 unit, 'b' has 2, whatever their prices.
    expect(result.totalDiscount).toBe(7);
    expect(result.discountByPieceId.get('a')).toBeCloseTo(7 / 3);
    expect(result.discountByPieceId.get('b')).toBeCloseTo(14 / 3);
    const splitTotal = [...result.discountByPieceId.values()].reduce((s, v) => s + v, 0);
    expect(splitTotal).toBeCloseTo(result.totalDiscount);
  });
});

describe('evaluateDeals price overrides', () => {
  test('discounts the staff override price, not the listed price', () => {
    const items = [line(piece('a', 40), 1, 20)];
    const result = evaluateDeals(items, [deal('percent_off', 1, 10)], NOW);

    expect(result.totalDiscount).toBe(2);
  });
});
