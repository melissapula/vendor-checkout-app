import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { PlanState, Store } from '../types/database';
import { isDemoEmail } from '../lib/demo';
import { CURRENT_TERMS_VERSION } from '../lib/terms';
import { planStateFromRpc } from '../lib/plan';

interface AuthContextValue {
  session: Session | null;
  authLoading: boolean;
  // True when signed into the shared public demo store (see src/lib/demo.ts).
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  store: Store | null;
  storeLoading: boolean;
  storeError: string | null;
  retryStoreFetch: () => void;
  createStore: (name: string, adminPin: string) => Promise<void>;
  updateStore: (
    updates: Partial<
      Pick<
        Store,
        | 'name'
        | 'admin_pin'
        | 'require_admin_pin'
        | 'low_stock_threshold'
        | 'enabled_payment_methods'
        | 'pass_fee_to_buyer'
        | 'venmo_username'
        | 'paypal_me_username'
        | 'cash_app_cashtag'
        | 'fee_overrides'
      >
    >
  ) => Promise<void>;
  // Records that the vendor accepted the current Terms version (see
  // src/lib/terms.ts), which lets them past AcceptTermsScreen.
  acceptTerms: () => Promise<void>;
  // For state written server-side by an Edge Function (stripe_account_id,
  // stripe_onboarding_complete) rather than through updateStore — re-fetches
  // the store row so local state catches up.
  refreshStore: () => Promise<void>;
  // The store's subscription plan from get_plan_state() (migration 0025),
  // or null before it loads or while plans don't exist yet. Use
  // src/lib/plan.ts to read it, rather than checking fields here.
  planState: PlanState | null;
  planError: string | null;
  // Re-fetches planState, for after the server changes it (a subscription
  // started or cancelled through Stripe).
  refreshPlanState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeFetchAttempt, setStoreFetchAttempt] = useState(0);
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

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

  // Keyed on the user id, not the whole `session` object: Supabase silently
  // issues a new session object (same user) whenever the tab regains focus
  // or its access token auto-refreshes — including right when the browser's
  // print dialog opens/closes. Keying on `session` itself re-ran this fetch
  // on every one of those, which set storeLoading back to true and made
  // AppGate below unmount its entire tree (loading spinner in its place),
  // wiping every screen's in-memory state — e.g. AppModeContext's `mode`
  // reset to its default 'customer', and an in-flight print job vanished.
  // That was the "prints blank" / "kicks me out to the customer view" bug.
  const userId = session?.user.id;

  useEffect(() => {
    if (!session) {
      setStore(null);
      setStoreError(null);
      setStoreLoading(false);
      return;
    }

    let cancelled = false;
    setStoreLoading(true);
    setStoreError(null);

    async function fetchStore() {
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('*')
          .eq('owner_id', session!.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          setStoreError(error.message);
        } else {
          setStore(data);
        }
      } catch (error) {
        if (cancelled) return;
        setStoreError(error instanceof Error ? error.message : 'Failed to load store');
      } finally {
        if (!cancelled) setStoreLoading(false);
      }
    }

    fetchStore();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, storeFetchAttempt]);

  // Keyed on the store id, for the same reason the fetch above is keyed on
  // the user id rather than the session object.
  const storeId = store?.id;

  useEffect(() => {
    if (!storeId) {
      setPlanState(null);
      setPlanError(null);
      return;
    }

    let cancelled = false;

    async function fetchPlanState() {
      const result = await loadPlanState();
      if (cancelled) return;
      setPlanState(result.planState);
      setPlanError(result.planError);
    }

    fetchPlanState();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function loadPlanState(): Promise<{ planState: PlanState | null; planError: string | null }> {
    try {
      // `get: true` sends a GET. A POST (rpc's default) from the demo login
      // is treated as a write by demoGuardedFetch (src/lib/supabase.ts),
      // which would show every demo visitor "The demo is read-only".
      return planStateFromRpc(await supabase.rpc('get_plan_state', {}, { get: true }));
    } catch (error) {
      return { planState: null, planError: error instanceof Error ? error.message : 'Failed to load plan' };
    }
  }

  async function refreshPlanState() {
    const result = await loadPlanState();
    setPlanState(result.planState);
    setPlanError(result.planError);
  }

  function retryStoreFetch() {
    setStoreFetchAttempt((n) => n + 1);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // With "Confirm email" turned on in the Supabase project, signUp succeeds
    // (account exists) but returns no session until the emailed link is
    // clicked — so the UI would otherwise just sit there with no feedback.
    // Returning that to the caller lets AuthScreen tell the user to go check
    // their inbox. Still returns false if the setting is ever turned back off.
    return { needsEmailConfirmation: !data.session };
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
      .insert({
        owner_id: session.user.id,
        name,
        admin_pin: adminPin,
        enabled_payment_methods: ['cash'],
        // The UI only calls this once the Terms/Privacy checkbox on
        // CreateStoreScreen is checked, so acceptance is stamped right here
        // rather than needing a separate write.
        terms_accepted_at: new Date().toISOString(),
        terms_version_accepted: CURRENT_TERMS_VERSION,
      })
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

  async function acceptTerms() {
    await updateStore({
      terms_version_accepted: CURRENT_TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    });
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
        isDemo: isDemoEmail(session?.user.email),
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        confirmPasswordReset,
        store,
        storeLoading,
        storeError,
        retryStoreFetch,
        createStore,
        updateStore,
        acceptTerms,
        refreshStore,
        planState,
        planError,
        refreshPlanState,
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
