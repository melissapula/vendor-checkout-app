import { supabase } from './supabase';
import { Piece, Sale } from '../types/database';

export interface RefundResult {
  sale: Sale;
  piece: Piece | null;
}

// card/cash_app went through Stripe, so refunding them needs a real Stripe
// API call (server-side — see stripe-refund-sale) before the DB is touched.
// venmo/paypal/cash are self-reported — staff attest they returned the
// money themselves, so refunding one is just a DB update.
function wasStripePaid(method: Sale['payment_method']): boolean {
  return method === 'card' || method === 'cash_app';
}

export async function refundSale(sale: Sale): Promise<RefundResult> {
  if (wasStripePaid(sale.payment_method)) {
    if (!sale.processor_payment_id) {
      throw new Error(
        'This sale has no Stripe payment on file to refund automatically — refund it from the Stripe dashboard, then contact support to correct this record.'
      );
    }
    const { data, error } = await supabase.functions.invoke<RefundResult>('stripe-refund-sale', {
      body: { saleId: sale.id },
    });
    if (error) throw error;
    return data!;
  }

  const { data, error } = await supabase.rpc('refund_sale', { p_sale_id: sale.id });
  if (error) throw error;
  return data;
}
