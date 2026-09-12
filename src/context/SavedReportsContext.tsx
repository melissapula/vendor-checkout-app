import React, { createContext, useContext, useEffect, useState } from 'react';
import { SavedReport } from '../types/database';
import { supabase } from '../lib/supabase';

type NewSavedReport = Omit<SavedReport, 'id' | 'store_id' | 'created_at'>;

interface SavedReportsContextValue {
  savedReports: SavedReport[];
  loading: boolean;
  error: string | null;
  addSavedReport: (report: NewSavedReport) => Promise<void>;
  deleteSavedReport: (id: string) => Promise<void>;
}

const SavedReportsContext = createContext<SavedReportsContextValue | null>(null);

export function SavedReportsProvider({ children }: { children: React.ReactNode }) {
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('saved_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setSavedReports(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addSavedReport(report: NewSavedReport) {
    const { data, error } = await supabase.from('saved_reports').insert(report).select().single();
    if (error) throw error;
    setSavedReports((prev) => [data, ...prev]);
  }

  async function deleteSavedReport(id: string) {
    const { error } = await supabase.from('saved_reports').delete().eq('id', id);
    if (error) throw error;
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <SavedReportsContext.Provider value={{ savedReports, loading, error, addSavedReport, deleteSavedReport }}>
      {children}
    </SavedReportsContext.Provider>
  );
}

export function useSavedReports() {
  const ctx = useContext(SavedReportsContext);
  if (!ctx) throw new Error('useSavedReports must be used within a SavedReportsProvider');
  return ctx;
}
