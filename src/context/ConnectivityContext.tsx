import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ConnectivityContextValue {
  isOnline: boolean;
}

const ConnectivityContext = createContext<ConnectivityContextValue>({ isOnline: true });

// Payment processing and every read/write in this app need a real internet
// connection (see AGENTS.md/README on the web-only architecture) — there's
// no offline mode to fall back to. This just makes sure staff actually
// *know* when the connection drops (easy to miss at a loud outdoor show)
// instead of silently hitting failures on every tap, so they can switch to
// a manual/paper fallback right away instead of after several confused
// retries.
export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // The browser's online/offline events only reflect the network
    // interface, not real internet reachability — a device can be
    // "connected" to a wifi network with no working upstream at all (common
    // at outdoor shows/venues), which those events alone wouldn't catch.
    // Periodically verify with an actual request instead.
    async function checkReachability() {
      if (!navigator.onLine) return; // already known offline — skip the request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      try {
        const { error } = await supabase.from('stores').select('id').limit(1).abortSignal(controller.signal);
        setIsOnline(!error);
      } catch {
        setIsOnline(false);
      } finally {
        clearTimeout(timeout);
      }
    }

    checkReachability();
    const interval = setInterval(checkReachability, 20000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  return <ConnectivityContext.Provider value={{ isOnline }}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  return useContext(ConnectivityContext);
}
