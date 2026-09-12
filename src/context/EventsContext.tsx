import React, { createContext, useContext, useEffect, useState } from 'react';
import { Event } from '../types/database';
import { supabase } from '../lib/supabase';

type NewEvent = Omit<Event, 'id' | 'store_id' | 'created_at'>;

interface EventsContextValue {
  events: Event[];
  loading: boolean;
  error: string | null;
  addEvent: (event: NewEvent) => Promise<void>;
  updateEvent: (id: string, updates: Partial<Event>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | null>(null);

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.from('events').select('*').order('start_date', { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      else setEvents(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addEvent(event: NewEvent) {
    const { data, error } = await supabase.from('events').insert(event).select().single();
    if (error) throw error;
    setEvents((prev) =>
      [...prev, data].sort((a, b) => b.start_date.localeCompare(a.start_date))
    );
  }

  async function updateEvent(id: string, updates: Partial<Event>) {
    const { error } = await supabase.from('events').update(updates).eq('id', id);
    if (error) throw error;
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }

  async function deleteEvent(id: string) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <EventsContext.Provider value={{ events, loading, error, addEvent, updateEvent, deleteEvent }}>
      {children}
    </EventsContext.Provider>
  );
}

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useEvents must be used within an EventsProvider');
  return ctx;
}

// A sale's event, if its sale_date falls inside any defined event's date
// range — computed live, not stored on the sale. If more than one event's
// range overlaps the same date (a vendor's own scheduling overlap), the
// most-recently-starting one wins, since `events` is kept sorted newest-
// first.
//
// `isoDate` is a UTC timestamp (sale_date is `new Date().toISOString()`)
// but event start/end dates are plain local calendar dates the vendor
// typed in — comparing UTC-sliced vs. local-typed dates can land on the
// wrong side of midnight near a timezone boundary, the same bug
// ReportsScreen's `parseLocalDate` comment already guards against. Convert
// to the local calendar date before comparing.
export function eventForDate(events: Event[], isoDate: string): Event | null {
  const d = new Date(isoDate);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return events.find((e) => local >= e.start_date && local <= e.end_date) ?? null;
}
