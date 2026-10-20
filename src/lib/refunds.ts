import { supabase } from './supabase';
import { unwrapFunctionError } from './payments';
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
    if (error) throw await unwrapFunctionError(error);
    return data!;
  }

  const { data, error } = await supabase.rpc('refund_sale', { p_sale_id: sale.id });
  if (error) throw error;
  return data;
}

// Body of the "Refunded" alert shown after refundSale() succeeds. Stripe
// refunds go back automatically (card about 5-10 business days, Cash App Pay
// up to 10, per Stripe's docs); self-reported ones only change our records,
// so staff are reminded the money is theirs to hand back.
export function refundSuccessMessage(result: RefundResult): string {
  const moneyLine = wasStripePaid(result.sale.payment_method)
    ? 'Stripe is returning the money to the customer. It can take up to 10 business days to show up.'
    : "Marked as refunded. Make sure you've given the customer their money back.";
  if (!result.piece) return moneyLine;
  return `${moneyLine}\n\n${result.piece.title} is back in stock.`;
}
