// Unit tests for the sales CSV rows (salesCsvRows in dataExport.ts). The
// platform_fee_amount column sits right after fee_amount, and net is what
// the vendor keeps after both fees, rounded to cents. Building the rows is
// tested on its own; the browser download around it is not.
import type { Piece, Sale } from '../types/database';
import { salesCsvRows } from './dataExport';

const piece = { id: 'p1', title: 'Heron at Dusk', sku: 'MFP-001' } as Piece;

function sale(fields: Partial<Sale>): Sale {
  return {
    piece_id: 'p1',
    sale_date: '2026-10-18T15:00:00Z',
    sale_price: 25,
    tip_amount: null,
    payment_method: 'card',
    fee_amount: 1.05,
    platform_fee_amount: 0.25,
    refunded_at: null,
    location: null,
    ...fields,
  } as Sale;
}

describe('salesCsvRows', () => {
  test('puts platform_fee_amount right after fee_amount', () => {
    const [row] = salesCsvRows([sale({})], [piece]);
    const columns = Object.keys(row);

    expect(columns.indexOf('platform_fee_amount')).toBe(columns.indexOf('fee_amount') + 1);
    expect(row.platform_fee_amount).toBe(0.25);
  });

  test('net subtracts both fees, rounded to cents', () => {
    const [row] = salesCsvRows([sale({ sale_price: 10, fee_amount: 0.59, platform_fee_amount: 0.1 })], [piece]);

    expect(row.net).toBe(9.31);
  });

  test('a sale from before the platform fee exports 0 and an unchanged net', () => {
    const [row] = salesCsvRows([sale({ sale_price: 20, fee_amount: 0.88, platform_fee_amount: 0 })], [piece]);

    expect(row.platform_fee_amount).toBe(0);
    expect(row.net).toBe(19.12);
  });

  test('keeps the existing columns and their order', () => {
    const [row] = salesCsvRows([sale({ tip_amount: 5, refunded_at: '2026-10-19T09:00:00Z', location: 'Booth 4' })], [piece]);

    expect(row).toEqual({
      sale_date: '2026-10-18T15:00:00Z',
      title: 'Heron at Dusk',
      sku: 'MFP-001',
      sale_price: 25,
      tip_amount: 5,
      payment_method: 'card',
      fee_amount: 1.05,
      platform_fee_amount: 0.25,
      net: 23.7,
      refunded: 'yes',
      refunded_at: '2026-10-19T09:00:00Z',
      location: 'Booth 4',
    });
    expect(Object.keys(row)).toEqual([
      'sale_date', 'title', 'sku', 'sale_price', 'tip_amount', 'payment_method',
      'fee_amount', 'platform_fee_amount', 'net', 'refunded', 'refunded_at', 'location',
    ]);
  });

  test('a sale whose piece is gone exports as Unknown item with no sku', () => {
    const [row] = salesCsvRows([sale({ piece_id: 'deleted' })], [piece]);

    expect(row.title).toBe('Unknown item');
    expect(row.sku).toBe('');
  });
});
