import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { applyTheme, DEFAULT_THEME, isThemeName, ThemeName } from '../lib/theme';

// Which color theme (see src/lib/theme.ts) the app is wearing.
//
// Two places remember it:
// - the store's own row (`stores.theme`), written when the vendor presses
//   "Save changes" in Settings. This is the store's real choice and follows
//   them to every device.
// - this browser's storage, written every time a theme is tapped. It makes
//   the picker a live preview, and it's the only memory available to the
//   read-only demo store, where a visitor can try every theme without
//   changing what anyone else sees.
// The saved choice wins; the browser's is the fallback.
interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const storageKey = (storeId: string) => `vc-theme:${storeId}`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { store, session, authLoading } = useAuth();
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);
  const storeId = store?.id;
  const savedTheme = store?.theme;

  useEffect(() => {
    let cancelled = false;
    const use = (next: ThemeName) => {
      if (cancelled) return;
      setThemeState(next);
      applyTheme(next);
    };

    if (storeId && isThemeName(savedTheme)) {
      use(savedTheme);
    } else if (storeId) {
      AsyncStorage.getItem(storageKey(storeId))
        .then((local) => use(isThemeName(local) ? local : DEFAULT_THEME))
        .catch(() => use(DEFAULT_THEME));
    } else if (!authLoading && !session) {
      // Signed out: the sign-in screen always wears the default.
      use(DEFAULT_THEME);
    }
    return () => {
      cancelled = true;
    };
  }, [storeId, savedTheme, session, authLoading]);

  function setTheme(next: ThemeName) {
    setThemeState(next);
    applyTheme(next);
    if (storeId) AsyncStorage.setItem(storageKey(storeId), next).catch(() => {});
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
