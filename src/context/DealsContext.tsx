import React, { createContext, useContext, useEffect, useState } from 'react';
import { Deal } from '../types/database';
import { supabase } from '../lib/supabase';

type NewDeal = Omit<Deal, 'id' | 'store_id'>;

interface DealsContextValue {
  deals: Deal[];
  loading: boolean;
  error: string | null;
  addDeal: (deal: NewDeal) => Promise<void>;
  updateDeal: (id: string, updates: Partial<Deal>) => Promise<void>;
  deleteDeal: (id: string) => Promise<void>;
}

const DealsContext = createContext<DealsContextValue | null>(null);

export function DealsProvider({ children }: { children: React.ReactNode }) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Fetch every deal, active or not — the deals engine already checks
      // `active` itself when evaluating a cart, and the management screen
      // needs to see (and toggle) inactive deals too.
      const { data, error } = await supabase.from('deals').select('*').order('name');
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

  async function addDeal(deal: NewDeal) {
    const { data, error } = await supabase.from('deals').insert(deal).select().single();
    if (error) throw error;
    setDeals((prev) => [...prev, data]);
  }

  async function updateDeal(id: string, updates: Partial<Deal>) {
    const { error } = await supabase.from('deals').update(updates).eq('id', id);
    if (error) throw error;
    setDeals((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  }

  async function deleteDeal(id: string) {
    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) throw error;
    setDeals((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <DealsContext.Provider value={{ deals, loading, error, addDeal, updateDeal, deleteDeal }}>
      {children}
    </DealsContext.Provider>
  );
}

export function useDeals() {
  const ctx = useContext(DealsContext);
  if (!ctx) throw new Error('useDeals must be used within a DealsProvider');
  return ctx;
}
