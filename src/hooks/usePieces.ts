import { useState } from 'react';
import { Piece } from '../types/database';
import { MOCK_PIECES } from '../data/mockPieces';

// Swap this for a Supabase query (`supabase.from('pieces').select()`) once
// the project exists — screens consume the hook's return shape, not the
// data source, so that swap shouldn't touch InventoryScreen/CartScreen.
export function usePieces() {
  const [pieces] = useState<Piece[]>(MOCK_PIECES);
  return { pieces, loading: false };
}

export function isSellable(piece: Piece): boolean {
  return piece.status === 'available' && piece.quantity_remaining > 0;
}
