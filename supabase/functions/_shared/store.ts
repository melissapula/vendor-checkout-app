import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

// Every payments function needs "the calling vendor's own store row" and
// nothing else. Building the client from the *caller's* Authorization header
// (forwarded automatically by supabase.functions.invoke()) rather than the
// service-role key means each function runs as that vendor, under the same
// current_store_id()-scoped RLS that already protects pieces/sales/deals/
// stores — a vendor's request can't structurally touch another vendor's
// stripe_account_id or handles, without any extra authorization code here.
export async function getCallingStore(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: store, error } = await supabase.from('stores').select('*').single();
  if (error || !store) {
    throw new Response(JSON.stringify({ error: 'No store found for this session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return { supabase, store };
}
