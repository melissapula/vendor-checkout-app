import React, { createContext, useContext, useEffect, useState } from 'react';
import { Deal } from '../types/database';
import { supabase } from '../lib/supabase';

interface DealsContextValue {
  deals: Deal[];
  loading: boolean;
  error: string | null;
}

const DealsContext = createContext<DealsContextValue | null>(null);

export function DealsProvider({ children }: { children: React.ReactNode }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.from('deals').select('*').eq('active', true);
      if (cancelled) return;
      if (error) setError(error.message);
      else setDeals(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DealsContext.Provider value={{ deals, loading, error }}>{children}</DealsContext.Provider>
  );
}

export function useDeals() {
  const ctx = useContext(DealsContext);
  if (!ctx) throw new Error('useDeals must be used within a DealsProvider');
  return ctx;
}
