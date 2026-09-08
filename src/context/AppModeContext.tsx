import React, { createContext, useContext, useState } from 'react';

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
  const [mode, setMode] = useState<Mode>('customer');

  return (
    <AppModeContext.Provider
      value={{
        mode,
        requestAdmin: () => setMode('pin'),
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
