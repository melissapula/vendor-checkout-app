import React, { createContext, useContext, useState } from 'react';
import { Sale } from '../types/database';

interface SalesContextValue {
  sales: Sale[];
  addSales: (sales: Sale[]) => void;
}

const SalesContext = createContext<SalesContextValue | null>(null);

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [sales, setSales] = useState<Sale[]>([]);

  function addSales(newSales: Sale[]) {
    setSales((prev) => [...prev, ...newSales]);
  }

  return (
    <SalesContext.Provider value={{ sales, addSales }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error('useSales must be used within a SalesProvider');
  return ctx;
}
