import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Store } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  authLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  store: Store | null;
  storeLoading: boolean;
  createStore: (name: string, adminPin: string) => Promise<void>;
  updateStore: (
    updates: Partial<
      Pick<
        Store,
        | 'name'
        | 'admin_pin'
        | 'enabled_payment_methods'
        | 'pass_fee_to_buyer'
        | 'venmo_username'
        | 'paypal_me_username'
        | 'cash_app_cashtag'
      >
    >
  ) => Promise<void>;
  // For state written server-side by an Edge Function (stripe_account_id,
  // stripe_onboarding_complete) rather than through updateStore — re-fetches
  // the store row so local state catches up.
  refreshStore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setStore(null);
      setStoreLoading(false);
      return;
    }

    let cancelled = false;
    setStoreLoading(true);

    supabase
      .from('stores')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setStore(data);
        setStoreLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // If the Supabase project still has "Confirm email" turned on, signUp
    // succeeds (account exists) but returns no session — so the UI would
    // otherwise just sit there with no feedback. This app's onboarding is
    // designed for immediate access (see README's "Multi-tenant" section),
    // so surface this clearly instead of silently doing nothing.
    if (!data.session) {
      throw new Error(
        'Your account was created, but email confirmation is turned on for this project, so you\'re not signed in yet. Check your email for a confirmation link, or — for instant access next time — turn off "Confirm email" under Authentication > Sign In / Providers > Email in the Supabase dashboard.'
      );
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  // Code-based reset (not a magic link) — avoids needing deep-linking/URL
  // scheme setup for a mobile app. Requires the Supabase project's "Reset
  // Password" email template to include {{ .Token }}, since the stock
  // template only shows a link. verifyOtp signs the user in with a recovery
  // session; updateUser then sets the real new password on that session.
  async function confirmPasswordReset(email: string, code: string, newPassword: string) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'recovery',
    });
    if (verifyError) throw verifyError;

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;
  }

  async function createStore(name: string, adminPin: string) {
    if (!session) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('stores')
      // Cash is the only method that needs no setup, so it's the only one a
      // brand-new store starts with — card/Cash App Pay need Stripe Connect,
      // Venmo/PayPal need a handle, so all three stay unselected in Payment
      // Settings until the vendor actually configures them.
      .insert({ owner_id: session.user.id, name, admin_pin: adminPin, enabled_payment_methods: ['cash'] })
      .select()
      .single();
    if (error) throw error;
    setStore(data);
  }

  async function updateStore(updates: Partial<Store>) {
    if (!store) throw new Error('No store to update');
    const { error } = await supabase.from('stores').update(updates).eq('id', store.id);
    if (error) throw error;
    setStore((prev) => (prev ? { ...prev, ...updates } : prev));
  }

  async function refreshStore() {
    if (!store) return;
    const { data, error } = await supabase.from('stores').select('*').eq('id', store.id).single();
    if (error) throw error;
    setStore(data);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        authLoading,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        confirmPasswordReset,
        store,
        storeLoading,
        createStore,
        updateStore,
        refreshStore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
