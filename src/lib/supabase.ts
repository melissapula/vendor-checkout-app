import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';
import { showDemoReadOnlyAlert } from './alert';
import { DEMO_READ_ONLY_MESSAGE, isDemoEmail } from './demo';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env and fill in your Supabase project values.'
  );
}

// The public demo store is read-only (see src/lib/demo.ts). Every request
// the app makes to Supabase passes through here, so this is the one place
// that can tell "reading" from "changing" without each screen having to
// know about the demo: anything that isn't a plain read of the data API,
// plus a change to the login itself, is refused with one friendly message.
// Signing in and out, edge functions and reads go through untouched. This
// is for the visitor's benefit only — the rule that actually protects the
// data is in supabase/migrations/0020_demo_read_only.sql.
function isDemoRequest(headers: HeadersInit | undefined): boolean {
  try {
    const token = new Headers(headers).get('Authorization')?.replace(/^Bearer\s+/i, '');
    const payload = token?.split('.')[1];
    if (!payload) return false;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return isDemoEmail(claims.email);
  } catch {
    return false;
  }
}

const demoGuardedFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && isDemoRequest(init?.headers)) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    if (path.startsWith('/rest/v1/') || path === '/auth/v1/user') {
      showDemoReadOnlyAlert();
      return new Response(JSON.stringify({ code: 'demo_read_only', message: DEMO_READ_ONLY_MESSAGE }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  return fetch(input, init);
};

// Every store owner's device stays signed in as them (kiosk usage — no
// per-customer login), so the session needs to survive app restarts.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: demoGuardedFetch },
});
