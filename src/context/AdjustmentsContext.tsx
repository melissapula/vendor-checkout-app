import React, { createContext, useContext, useEffect, useState } from 'react';
import { InventoryAdjustment } from '../types/database';
import { supabase } from '../lib/supabase';

interface AdjustmentsContextValue {
  adjustments: InventoryAdjustment[];
  loading: boolean;
  error: string | null;
  // Local-only merge — no DB write. The row has already been inserted
  // server-side by the atomic log_inventory_adjustment RPC; this just
  // brings local state in sync — same reasoning as SalesContext.applySales.
  applyAdjustment: (adjustment: InventoryAdjustment) => void;
}

const AdjustmentsContext = createContext<AdjustmentsContextValue | null>(null);

export function AdjustmentsProvider({ children }: { children: React.ReactNode }) {
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('inventory_adjustments')
        .select('*')
        .order('adjustment_date', { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setAdjustments(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyAdjustment(adjustment: InventoryAdjustment) {
    setAdjustments((prev) => [adjustment, ...prev]);
  }

  return (
    <AdjustmentsContext.Provider value={{ adjustments, loading, error, applyAdjustment }}>
      {children}
    </AdjustmentsContext.Provider>
  );
}

export function useAdjustments() {
  const ctx = useContext(AdjustmentsContext);
  if (!ctx) throw new Error('useAdjustments must be used within an AdjustmentsProvider');
  return ctx;
}
