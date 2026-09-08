import React, { createContext, useContext, useState } from 'react';
import { Piece } from '../types/database';
import { SEED_PIECES } from '../data/seedPieces';

interface PiecesContextValue {
  pieces: Piece[];
  sellUnits: (pieceId: string, quantitySold: number) => void;
}

const PiecesContext = createContext<PiecesContextValue | null>(null);

export function PiecesProvider({ children }: { children: React.ReactNode }) {
  const [pieces, setPieces] = useState<Piece[]>(SEED_PIECES);

  function sellUnits(pieceId: string, quantitySold: number) {
    setPieces((prev) =>
      prev.map((p) => {
        if (p.id !== pieceId) return p;
        const remaining = Math.max(0, p.quantity_remaining - quantitySold);
        return {
          ...p,
          quantity_remaining: remaining,
          status: remaining === 0 ? 'sold' : p.status,
          date_sold: remaining === 0 ? new Date().toISOString() : p.date_sold,
        };
      })
    );
  }

  return (
    <PiecesContext.Provider value={{ pieces, sellUnits }}>
      {children}
    </PiecesContext.Provider>
  );
}

export function usePieces() {
  const ctx = useContext(PiecesContext);
  if (!ctx) throw new Error('usePieces must be used within a PiecesProvider');
  return ctx;
}

export function isSellable(piece: Piece): boolean {
  return piece.status === 'available' && piece.quantity_remaining > 0;
}
