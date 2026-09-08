import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sale } from '../types/database';
import { supabase } from '../lib/supabase';

type NewSale = Omit<Sale, 'id'>;

interface SalesContextValue {
  sales: Sale[];
  loading: boolean;
  error: string | null;
  addSales: (sales: NewSale[]) => Promise<void>;
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

  async function addSales(newSales: NewSale[]) {
    const { data, error } = await supabase.from('sales').insert(newSales).select();
    if (error) throw error;
    setSales((prev) => [...(data ?? []), ...prev]);
  }

  return (
    <SalesContext.Provider value={{ sales, loading, error, addSales }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within a SalesProvider');
  return ctx;
}
