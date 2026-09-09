import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';

export interface ScanResult {
  success: boolean;
  message: string;
}

// Shared by both scan entry points (a keyboard-wedge USB/Bluetooth scanner
// typing into the SKU field, and the camera scanner) — same lookup/add
// logic either way, just a different way of getting the SKU string.
export function useScanToCart() {
  const { pieces } = usePieces();
  const { items, addItem } = useCart();

  function addBySku(rawSku: string): ScanResult {
    const sku = rawSku.trim();
    if (!sku) return { success: false, message: 'No code read.' };

    const piece = pieces.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
    if (!piece) return { success: false, message: `No item found for SKU "${sku}".` };
    if (!isSellable(piece)) return { success: false, message: `${piece.title} isn't available to sell.` };

    const existing = items.find((i) => i.piece.id === piece.id);
    if (existing && existing.quantity >= piece.quantity_remaining) {
      return { success: false, message: `Only ${piece.quantity_remaining} of ${piece.title} in stock — already at max in cart.` };
    }

    addItem(piece);
    return { success: true, message: `Added ${piece.title}.` };
  }

  return { addBySku };
}
