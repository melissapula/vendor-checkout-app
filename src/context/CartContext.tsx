import React, { createContext, useContext, useMemo, useState } from 'react';
import { Piece } from '../types/database';

export interface CartItem {
  piece: Piece;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (piece: Piece) => void;
  removeItem: (pieceId: string) => void;
  updateQuantity: (pieceId: string, quantity: number) => void;
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

  function clear() {
    setItems([]);
  }

  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.piece.price * i.quantity, 0),
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
