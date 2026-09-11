import { Piece } from '../types/database';
import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';

export interface ScanResult {
  success: boolean;
  message: string;
}

export type ScanLookup = { found: true; piece: Piece } | { found: false; message: string };

// Shared by both scan entry points (a keyboard-wedge USB/Bluetooth scanner
// typing into the SKU field, and the camera scanner) — same lookup/add
// logic either way, just a different way of getting the SKU string.
export function useScanToCart() {
  const { pieces } = usePieces();
  const { items, addItem } = useCart();

  // Lookup with no side effect — lets the camera scanner show what it found
  // (title, price, an Add button) before anything actually lands in the
  // cart, instead of silently auto-adding the moment a code decodes.
  function lookupSku(rawSku: string): ScanLookup {
    const sku = rawSku.trim();
    if (!sku) return { found: false, message: 'No code read.' };

    const piece = pieces.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
    if (!piece) return { found: false, message: `No item found for SKU "${sku}".` };
    if (!isSellable(piece)) return { found: false, message: `${piece.title} isn't available to sell.` };

    const existing = items.find((i) => i.piece.id === piece.id);
    if (existing && existing.quantity >= piece.quantity_remaining) {
      return { found: false, message: `Only ${piece.quantity_remaining} of ${piece.title} in stock — already at max in cart.` };
    }

    return { found: true, piece };
  }

  function addBySku(rawSku: string): ScanResult {
    const resolved = lookupSku(rawSku);
    if (!resolved.found) return { success: false, message: resolved.message };
    addItem(resolved.piece);
    return { success: true, message: `Added ${resolved.piece.title}.` };
  }

  return { addBySku, lookupSku };
}
