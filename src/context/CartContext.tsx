import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Piece } from '../types/database';
import { usePieces } from './PiecesContext';
import { useAuth } from './AuthContext';

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

function cartStorageKey(storeId: string): string {
  return `cart:${storeId}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [location, setLocation] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const { pieces } = usePieces();
  const { store } = useAuth();

  // A cart left mid-sale used to vanish on any page reload — this is a
  // kiosk-style app left running in a browser tab, so an accidental
  // refresh, a WiFi hiccup, or the browser reclaiming the tab could wipe
  // an in-progress sale for no reason. Persist it (scoped per store, so a
  // shared device switching vendors never shows the wrong cart) and only
  // ever clear it the two ways staff actually expect: a completed
  // checkout (CheckoutScreen.finalizeSale calls clear()) or the explicit
  // "Clear cart" button in CartScreen (admin-only — it doesn't exist
  // anywhere in CustomerScreen).
  //
  // Loading is async (AsyncStorage), so `hydrated` gates the save effect
  // below — without it, the very first render's empty `items`/`location`
  // defaults would get written to storage and clobber whatever was there
  // before the load even finishes.
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    setHydrated(false);
    setItems([]);
    setLocation('');
    AsyncStorage.getItem(cartStorageKey(store.id))
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items)) setItems(parsed.items);
        if (typeof parsed.location === 'string') setLocation(parsed.location);
      })
      .catch(() => {
        // Corrupt/unreadable data — start fresh rather than crash the cart.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    if (!store || !hydrated) return;
    AsyncStorage.setItem(cartStorageKey(store.id), JSON.stringify({ items, location })).catch(() => {
      // Best-effort — a failed write just means the next reload won't
      // recover this state; nothing in the current session breaks.
    });
  }, [store, hydrated, items, location]);

  // A cart line's `piece` is a snapshot from whenever it was added — but
  // stock can change after that (another sale on this device, or staff
  // editing quantity_remaining in Inventory), and the quantity cap used to
  // be checked against that stale snapshot forever. Re-sync against
  // PiecesContext's live data any time it changes, so the cap (and the
  // displayed price/title) stay current for the rest of the checkout
  // session; a line whose stock has dropped to 0 is dropped the same way
  // updateQuantity(..., 0) drops it. A piece deleted outright (not just
  // sold out) is dropped too — with the cart now persisting across
  // reloads, a stale line with no live piece behind it could otherwise
  // sit there indefinitely instead of failing fast the moment it happens.
  useEffect(() => {
    setItems((prev) =>
      prev
        .flatMap((item) => {
          const live = pieces.find((p) => p.id === item.piece.id);
          if (!live) return [];
          return [{ ...item, piece: live, quantity: Math.min(item.quantity, live.quantity_remaining) }];
        })
        .filter((item) => item.quantity > 0)
    );
  }, [pieces]);

  function addItem(piece: Piece) {
    setItems((prev) => {
      const live = pieces.find((p) => p.id === piece.id) ?? piece;
      const existing = prev.find((i) => i.piece.id === live.id);
      if (existing) {
        if (existing.quantity >= live.quantity_remaining) return prev;
        return prev.map((i) =>
          i.piece.id === live.id ? { ...i, piece: live, quantity: i.quantity + 1 } : i
        );
      }
      if (live.quantity_remaining <= 0) return prev;
      return [...prev, { piece: live, quantity: 1 }];
    });
  }

  function removeItem(pieceId: string) {
    setItems((prev) => prev.filter((i) => i.piece.id !== pieceId));
  }

  function updateQuantity(pieceId: string, quantity: number) {
    setItems((prev) => {
      if (quantity <= 0) return prev.filter((i) => i.piece.id !== pieceId);
      return prev.map((i) => {
        if (i.piece.id !== pieceId) return i;
        const live = pieces.find((p) => p.id === pieceId) ?? i.piece;
        return { ...i, piece: live, quantity: Math.min(quantity, live.quantity_remaining) };
      });
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
