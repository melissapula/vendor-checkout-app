// Unit tests for the "Refunded" alert text (refundSuccessMessage in
// refunds.ts). Card and Cash App went through Stripe, so the alert says the
// money is on its way back; cash, Venmo and PayPal are self-reported, so it
// reminds staff to hand the money back themselves. The stock line only shows
// when the refund put a piece back (a custom one-off item has none).
import type { Piece, Sale } from '../types/database';
import { refundSuccessMessage } from './refunds';

// refunds.ts imports the Supabase client, which needs env vars at load.
// These tests never reach it.
jest.mock('./supabase', () => ({ supabase: {} }));
jest.mock('./payments', () => ({ unwrapFunctionError: jest.fn() }));

const STRIPE_LINE = 'Stripe is returning the money to the customer. It can take up to 10 business days to show up.';
const SELF_REPORTED_LINE = "Marked as refunded. Make sure you've given the customer their money back.";

function sale(payment_method: Sale['payment_method']): Sale {
  return { payment_method } as Sale;
}

const piece = { title: 'Blue Heron' } as Piece;

describe('refundSuccessMessage', () => {
  test('card refund says Stripe is returning the money', () => {
    expect(refundSuccessMessage({ sale: sale('card'), piece })).toBe(`${STRIPE_LINE}\n\nBlue Heron is back in stock.`);
  });

  test('Cash App refund says Stripe is returning the money', () => {
    expect(refundSuccessMessage({ sale: sale('cash_app'), piece })).toBe(
      `${STRIPE_LINE}\n\nBlue Heron is back in stock.`,
    );
  });

  test.each(['cash', 'venmo', 'paypal'] as const)('%s refund reminds staff to give the money back', (method) => {
    expect(refundSuccessMessage({ sale: sale(method), piece })).toBe(
      `${SELF_REPORTED_LINE}\n\nBlue Heron is back in stock.`,
    );
  });

  test('leaves out the stock line when no piece was returned', () => {
    expect(refundSuccessMessage({ sale: sale('cash'), piece: null })).toBe(SELF_REPORTED_LINE);
  });
});
