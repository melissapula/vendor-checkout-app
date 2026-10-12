import React, { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';

type Mode = 'customer' | 'pin' | 'admin';

interface AppModeContextValue {
  mode: Mode;
  requestAdmin: () => void;
  unlockAdmin: () => void;
  cancelPinEntry: () => void;
  exitToCustomer: () => void;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

export function AppModeProvider({ children }: { children: React.ReactNode }) {
  const { store, isDemo } = useAuth();
  // A real store opens on the customer-facing screen, since that's what a
  // booth's device should show by default. Someone exploring the demo
  // store is there to see the vendor side, and the customer screen is
  // nearly blank until a cart exists — so the demo opens straight into it.
  const [mode, setMode] = useState<Mode>(isDemo ? 'admin' : 'customer');

  // Defaults to requiring the PIN (matches the DB column's default) unless
  // a vendor has explicitly turned it off in Store Settings — a solo seller
  // with no one else to gate out of the admin view.
  function requestAdmin() {
    setMode(store?.require_admin_pin === false ? 'admin' : 'pin');
  }

  return (
    <AppModeContext.Provider
      value={{
        mode,
        requestAdmin,
        unlockAdmin: () => setMode('admin'),
        cancelPinEntry: () => setMode('customer'),
        exitToCustomer: () => setMode('customer'),
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error('useAppMode must be used within an AppModeProvider');
  return ctx;
}
