import { Piece } from '../types/database';

export interface CartItem {
  piece: Piece;
  quantity: number;
  // Staff-set one-off price for this sale only (e.g. a special deal for a
  // particular buyer) — never writes back to the piece's actual listed
  // price. Undefined/null means "use the catalog price as normal".
  overridePrice?: number | null;
}

// The price actually charged for a cart line — the manual override if
// staff set one for this sale, otherwise the piece's normal listed price.
// Shared by every screen/lib that needs to total up the cart (CartScreen,
// CustomerScreen, CheckoutScreen, the deals engine) so an override is
// reflected consistently everywhere instead of just wherever it was set.
export function effectivePrice(item: CartItem): number {
  return item.overridePrice ?? item.piece.price;
}
