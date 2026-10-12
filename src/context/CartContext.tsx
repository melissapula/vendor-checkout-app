import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
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
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { pieces } = usePieces();
  const { store, isDemo } = useAuth();

  // The cart is shared across every device signed into this store — one
  // row per store in `store_carts`, synced live via Realtime — rather than
  // local to whatever device happens to be holding it. This app runs one
  // active sale at a time by design (a vendor's own choice, not a
  // limitation worth working around with per-transaction carts), so
  // "the store's current cart" is the right model: a phone scanning an
  // item shows up immediately on the iPad running checkout, instead of
  // being invisible to it. Replaces the old local-only AsyncStorage
  // version, which never left the device that wrote it.
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    setHydrated(false);
    setItems([]);

    (async () => {
      try {
        const { data } = await supabase
          .from('store_carts')
          .select('items')
          .eq('store_id', store.id)
          .maybeSingle();
        if (cancelled || !data) return;
        if (Array.isArray(data.items)) setItems(data.items as unknown as CartItem[]);
      } catch {
        // Corrupt/unreadable row, or none yet — start fresh rather than
        // crash the cart.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    let channel: RealtimeChannel | null = supabase
      .channel(`store_carts:${store.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_carts', filter: `store_id=eq.${store.id}` },
        (payload) => {
          const row = payload.new as { items?: unknown } | undefined;
          if (!row) return; // a delete — nothing to apply
          if (Array.isArray(row.items)) setItems(row.items as unknown as CartItem[]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [store]);

  // Fire-and-forget from every caller's perspective — local state is
  // already updated optimistically by whichever mutator calls this, so a
  // slow network round-trip never blocks this device's own UI. Other
  // devices pick up the change via the Realtime subscription above; this
  // device's own echo of that same change is a harmless no-op re-render.
  //
  // The demo store is read-only, so there the cart simply stays on this
  // device: each visitor gets their own to play with, and nothing is sent.
  function persist(nextItems: CartItem[]) {
    if (!store || !hydrated || isDemo) return;
    supabase
      .from('store_carts')
      .upsert({ store_id: store.id, items: nextItems as unknown as never })
      .then(() => {});
  }

  // A cart line's `piece` is a snapshot from whenever it was added — but
  // stock can change after that (a sale on any device now, or staff
  // editing quantity_remaining in Inventory), and the quantity cap used to
  // be checked against that stale snapshot forever. Re-sync against
  // PiecesContext's live data any time it changes, so the cap (and the
  // displayed price/title) stay current; a line whose stock has dropped to
  // 0 is dropped the same way updateQuantity(..., 0) drops it. A piece
  // deleted outright (not just sold out) is dropped too. Writes the
  // correction back to the shared row (not just local state) so every
  // device converges on it, not only whichever one happened to notice.
  useEffect(() => {
    setItems((prev) => {
      const next = prev
        .flatMap((item) => {
          const live = pieces.find((p) => p.id === item.piece.id);
          if (!live) return [];
          return [{ ...item, piece: live, quantity: Math.min(item.quantity, live.quantity_remaining) }];
        })
        .filter((item) => item.quantity > 0);
      if (hydrated && JSON.stringify(next) !== JSON.stringify(prev)) {
        persist(next);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces]);

  function addItem(piece: Piece) {
    let next: CartItem[] | null = null;
    setItems((prev) => {
      const live = pieces.find((p) => p.id === piece.id) ?? piece;
      const existing = prev.find((i) => i.piece.id === live.id);
      if (existing) {
        if (existing.quantity >= live.quantity_remaining) {
          next = prev;
          return prev;
        }
        next = prev.map((i) => (i.piece.id === live.id ? { ...i, piece: live, quantity: i.quantity + 1 } : i));
      } else {
        if (live.quantity_remaining <= 0) {
          next = prev;
          return prev;
        }
        next = [...prev, { piece: live, quantity: 1 }];
      }
      return next;
    });
    if (next) persist(next);
  }

  function removeItem(pieceId: string) {
    let next: CartItem[] = [];
    setItems((prev) => {
      next = prev.filter((i) => i.piece.id !== pieceId);
      return next;
    });
    persist(next);
  }

  function updateQuantity(pieceId: string, quantity: number) {
    let next: CartItem[] = [];
    setItems((prev) => {
      if (quantity <= 0) {
        next = prev.filter((i) => i.piece.id !== pieceId);
      } else {
        next = prev.map((i) => {
          if (i.piece.id !== pieceId) return i;
          const live = pieces.find((p) => p.id === pieceId) ?? i.piece;
          return { ...i, piece: live, quantity: Math.min(quantity, live.quantity_remaining) };
        });
      }
      return next;
    });
    persist(next);
  }

  function setItemPrice(pieceId: string, price: number | null) {
    let next: CartItem[] = [];
    setItems((prev) => {
      next = prev.map((i) => (i.piece.id === pieceId ? { ...i, overridePrice: price } : i));
      return next;
    });
    persist(next);
  }

  function clear() {
    setItems([]);
    persist([]);
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
