// The web app is served from a different origin (vendor-checkout-app.expo.app)
// than the Edge Functions (<project>.supabase.co), so the browser's fetch
// needs these on every response, including the OPTIONS preflight.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
