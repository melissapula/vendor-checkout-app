import React, { createContext, useContext, useEffect, useState } from 'react';
import { Piece } from '../types/database';
import { supabase } from '../lib/supabase';

interface PiecesContextValue {
  pieces: Piece[];
  loading: boolean;
  error: string | null;
  sellUnits: (pieceId: string, quantitySold: number) => Promise<void>;
  updatePiece: (pieceId: string, updates: Partial<Piece>) => Promise<void>;
}

const PiecesContext = createContext<PiecesContextValue | null>(null);

export function PiecesProvider({ children }: { children: React.ReactNode }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.from('pieces').select('*').order('sku');
      if (cancelled) return;
      if (error) setError(error.message);
      else setPieces(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sellUnits(pieceId: string, quantitySold: number) {
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) return;

    const remaining = Math.max(0, piece.quantity_remaining - quantitySold);
    const updates: Partial<Piece> = {
      quantity_remaining: remaining,
      status: remaining === 0 ? 'sold' : piece.status,
      date_sold: remaining === 0 ? new Date().toISOString() : piece.date_sold,
    };

    const { error } = await supabase.from('pieces').update(updates).eq('id', pieceId);
    if (error) throw error;

    setPieces((prev) => prev.map((p) => (p.id === pieceId ? { ...p, ...updates } : p)));
  }

  async function updatePiece(pieceId: string, updates: Partial<Piece>) {
    const { error } = await supabase.from('pieces').update(updates).eq('id', pieceId);
    if (error) throw error;
    setPieces((prev) => prev.map((p) => (p.id === pieceId ? { ...p, ...updates } : p)));
  }

  return (
    <PiecesContext.Provider value={{ pieces, loading, error, sellUnits, updatePiece }}>
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
