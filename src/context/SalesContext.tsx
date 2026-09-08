import React, { createContext, useContext, useState } from 'react';
import { Sale } from '../types/database';
import { supabase } from '../lib/supabase';

type NewSale = Omit<Sale, 'id'>;

interface SalesContextValue {
  sales: Sale[];
  addSales: (sales: NewSale[]) => Promise<void>;
}

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [sales, setSales] = useState<Sale[]>([]);

  async function addSales(newSales: NewSale[]) {
    const { data, error } = await supabase.from('sales').insert(newSales).select();
    if (error) throw error;
    setSales((prev) => [...prev, ...(data ?? [])]);
  }

  return (
    <SalesContext.Provider value={{ sales, addSales }}>{children}</SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within a SalesProvider');
  return ctx;
}
