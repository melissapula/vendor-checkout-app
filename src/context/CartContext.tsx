import React, { createContext, useContext, useMemo, useState } from 'react';
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

interface CartContextValue {
  items: CartItem[];
  addItem: (piece: Piece) => void;
  removeItem: (pieceId: string) => void;
  updateQuantity: (pieceId: string, quantity: number) => void;
  // Pass null to clear an override and revert to the piece's listed price.
  setItemPrice: (pieceId: string, price: number | null) => void;
  clear: () => void;
  subtotal: number;
  itemCount: number;
  // Current show/venue name, attached to each Sale at checkout. Lives here
  // (not local to CheckoutScreen) so it persists across a whole session of
  // checkouts instead of needing retyping for every sale.
  location: string;
  setLocation: (location: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [location, setLocation] = useState('');

  function addItem(piece: Piece) {
    setItems((prev) => {
      const existing = prev.find((i) => i.piece.id === piece.id);
      const maxQuantity = piece.quantity_remaining;
      if (existing) {
        if (existing.quantity >= maxQuantity) return prev;
        return prev.map((i) =>
          i.piece.id === piece.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { piece, quantity: 1 }];
    });
  }

  function removeItem(pieceId: string) {
    setItems((prev) => prev.filter((i) => i.piece.id !== pieceId));
  }

  function updateQuantity(pieceId: string, quantity: number) {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.piece.id !== pieceId);
      return prev.map((i) =>
        i.piece.id === pieceId
          ? { ...i, quantity: Math.min(quantity, i.piece.quantity_remaining) }
          : i
      );
    });
  }

  function setItemPrice(pieceId: string, price: number | null) {
    setItems((prev) =>
      prev.map((i) => (i.piece.id === pieceId ? { ...i, overridePrice: price } : i))
    );
  }

  function clear() {
    setItems([]);
  }

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + effectivePrice(i) * i.quantity, 0),
    [items]
  );
  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        setItemPrice,
        clear,
        subtotal,
        itemCount,
        location,
        setLocation,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
