import React, { createContext, useContext, useEffect, useState } from 'react';
import { Piece } from '../types/database';
import { supabase } from '../lib/supabase';

type NewPiece = Omit<Piece, 'id' | 'store_id' | 'date_created'>;

interface PiecesContextValue {
  pieces: Piece[];
  loading: boolean;
  error: string | null;
  // Local-only merge — no DB write. Callers that already changed these rows
  // server-side (e.g. CheckoutScreen's atomic finalize_sale RPC) use this to
  // bring local state in sync with what the DB now actually holds, instead
  // of re-deriving the new quantity from a possibly-stale client snapshot.
  applyPieceUpdates: (updated: Piece[]) => void;
  updatePiece: (pieceId: string, updates: Partial<Piece>) => Promise<void>;
  addPiece: (piece: NewPiece) => Promise<Piece>;
  deletePiece: (pieceId: string) => Promise<void>;
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

  function applyPieceUpdates(updated: Piece[]) {
    const byId = new Map(updated.map((p) => [p.id, p]));
    setPieces((prev) => prev.map((p) => byId.get(p.id) ?? p));
  }

  async function updatePiece(pieceId: string, updates: Partial<Piece>) {
    const { error } = await supabase.from('pieces').update(updates).eq('id', pieceId);
    if (error) throw error;
    setPieces((prev) => prev.map((p) => (p.id === pieceId ? { ...p, ...updates } : p)));
  }

  async function addPiece(piece: NewPiece) {
    const { data, error } = await supabase.from('pieces').insert(piece).select().single();
    if (error) throw error;
    setPieces((prev) => [...prev, data].sort((a, b) => a.sku.localeCompare(b.sku)));
    return data;
  }

  async function deletePiece(pieceId: string) {
    const { error } = await supabase.from('pieces').delete().eq('id', pieceId);
    if (error) throw error;
    setPieces((prev) => prev.filter((p) => p.id !== pieceId));
  }

  return (
    <PiecesContext.Provider
      value={{ pieces, loading, error, applyPieceUpdates, updatePiece, addPiece, deletePiece }}
    >
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
