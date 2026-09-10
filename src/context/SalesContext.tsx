import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sale } from '../types/database';
import { supabase } from '../lib/supabase';

interface SalesContextValue {
  sales: Sale[];
  loading: boolean;
  error: string | null;
  // Local-only merge — no DB write. The rows have already been inserted
  // server-side (e.g. by CheckoutScreen's atomic finalize_sale RPC); this
  // just brings local state in sync.
  applySales: (sales: Sale[]) => void;
  // Local-only merge for a single already-updated sale (e.g. after
  // refund_sale marks one refunded server-side) — same reasoning.
  applySaleUpdate: (sale: Sale) => void;
}

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('sale_date', { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setSales(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function applySales(newSales: Sale[]) {
    setSales((prev) => [...newSales, ...prev]);
  }

  function applySaleUpdate(updated: Sale) {
    setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  return (
    <SalesContext.Provider value={{ sales, loading, error, applySales, applySaleUpdate }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within a SalesProvider');
  return ctx;
}
