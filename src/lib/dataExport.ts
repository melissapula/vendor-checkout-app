import Papa from 'papaparse';
import { Piece, Sale } from '../types/database';

// Plain browser download — this is a real deployed web app (not a sandboxed
// Artifact), so a Blob + temporary <a download> link works normally.
function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportInventoryCsv(pieces: Piece[]) {
  const rows = pieces.map((p) => ({
    sku: p.sku,
    title: p.title,
    type: p.type,
    medium: p.medium ?? '',
    series: p.series ?? '',
    size: p.size ?? '',
    width_in: p.width_in ?? '',
    height_in: p.height_in ?? '',
    price: p.price,
    cost_basis: p.cost_basis ?? '',
    quantity_remaining: p.quantity_remaining,
    status: p.status,
    date_created: p.date_created,
    date_sold: p.date_sold ?? '',
    notes: p.notes ?? '',
  }));
  downloadCsv(`inventory-${todayStamp()}.csv`, rows);
}

// fee_amount is Stripe's fee and platform_fee_amount the MFP Apps fee; net
// is what the vendor keeps after both.
export function salesCsvRows(sales: Sale[], pieces: Piece[]) {
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  return sales.map((s) => ({
    sale_date: s.sale_date,
    title: pieceById.get(s.piece_id)?.title ?? 'Unknown item',
    sku: pieceById.get(s.piece_id)?.sku ?? '',
    sale_price: s.sale_price,
    tip_amount: s.tip_amount ?? 0,
    payment_method: s.payment_method,
    fee_amount: s.fee_amount,
    platform_fee_amount: s.platform_fee_amount,
    net: Math.round((s.sale_price - s.fee_amount - s.platform_fee_amount) * 100) / 100,
    refunded: s.refunded_at ? 'yes' : 'no',
    refunded_at: s.refunded_at ?? '',
    location: s.location ?? '',
  }));
}

export function exportSalesCsv(sales: Sale[], pieces: Piece[]) {
  downloadCsv(`sales-${todayStamp()}.csv`, salesCsvRows(sales, pieces));
}
