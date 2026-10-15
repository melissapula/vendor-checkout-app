// Unit tests for effectivePrice (cartItem.ts), the price every cart total,
// the customer screen, checkout and the deals engine charge for a line.
import type { Piece } from '../types/database';
import { effectivePrice, type CartItem } from './cartItem';

// Only price matters to effectivePrice, so the rest of Piece is left out.
function line(price: number, overridePrice?: number | null): CartItem {
  return { piece: { price } as Piece, quantity: 1, overridePrice };
}

describe('effectivePrice', () => {
  test('uses the override when staff set one', () => {
    expect(effectivePrice(line(40, 25))).toBe(25);
  });

  test('uses the listed price when the override is null', () => {
    expect(effectivePrice(line(40, null))).toBe(40);
  });

  test('uses the listed price when there is no override', () => {
    expect(effectivePrice(line(40))).toBe(40);
  });

  test('keeps an override of 0 (a free item), not the listed price', () => {
    expect(effectivePrice(line(40, 0))).toBe(0);
  });
});
