import { supabase } from './supabase';

// Returns true if the code was valid and is now claimed by the signed-in
// user (or already was, on a retry) — see
// supabase/migrations/0017_beta_invite_codes.sql for why this has to be an
// RPC rather than a direct table read: the caller has no store yet at this
// point, so there's no store_id to scope a normal RLS policy on.
export async function redeemBetaCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('redeem_beta_code', { p_code: code });
  if (error) throw error;
  return data;
}
