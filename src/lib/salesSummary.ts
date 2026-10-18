import { Sale } from '../types/database';

// The numbers in the Reports summary box (src/screens/ReportsScreen.tsx),
// which saved reports also freeze into their snapshot. fees is Stripe's fee;
// platformFees is the MFP Apps application fee (see
// supabase/functions/_shared/platformFee.ts). Net is what the vendor keeps
// after both. Refunded sales are left out: the money isn't the store's
// anymore.
export type SalesSummary = {
  gross: number;
  fees: number;
  platformFees: number;
  tips: number;
  net: number;
  count: number;
};

export function summarizeSales(sales: Sale[]): SalesSummary {
  const active = sales.filter((s) => !s.refunded_at);
  const gross = active.reduce((sum, s) => sum + s.sale_price, 0);
  const fees = active.reduce((sum, s) => sum + s.fee_amount, 0);
  const platformFees = active.reduce((sum, s) => sum + s.platform_fee_amount, 0);
  const tips = active.reduce((sum, s) => sum + (s.tip_amount ?? 0), 0);
  return { gross, fees, platformFees, tips, net: gross - fees - platformFees, count: active.length };
}
