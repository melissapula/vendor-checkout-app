// Unit tests for the pay-link URL builders (payLinks.ts). Expected formats
// are the documented ones quoted at the top of payLinks.ts. renderQrDataUrl
// draws an image and isn't covered here.
import { cashAppPayUrl, paypalPayUrl, venmoPayUrl } from './payLinks';

describe('venmoPayUrl', () => {
  test('builds a pay link with the amount in dollars and cents and the note encoded', () => {
    expect(venmoPayUrl('mfp-studios', 25, 'Order #12 & tip')).toBe(
      'https://venmo.com/mfp-studios?txn=pay&amount=25.00&note=Order+%2312+%26+tip',
    );
  });

  test('encodes the username', () => {
    expect(venmoPayUrl('mfp studios', 5, '')).toBe('https://venmo.com/mfp%20studios?txn=pay&amount=5.00&note=');
  });
});

describe('paypalPayUrl', () => {
  test('puts the amount and USD straight after it in the path', () => {
    expect(paypalPayUrl('mfpstudios', 12.5)).toBe('https://paypal.me/mfpstudios/12.50USD');
  });

  test('encodes the username', () => {
    expect(paypalPayUrl('mfp/studios', 3)).toBe('https://paypal.me/mfp%2Fstudios/3.00USD');
  });
});

describe('cashAppPayUrl', () => {
  test('builds a pay link from a cashtag with or without its $', () => {
    expect(cashAppPayUrl('$mfpstudios', 7)).toBe('https://cash.app/$mfpstudios/7.00');
    expect(cashAppPayUrl('mfpstudios', 7)).toBe('https://cash.app/$mfpstudios/7.00');
  });

  test('rounds the amount to cents', () => {
    expect(cashAppPayUrl('mfpstudios', 19.999)).toBe('https://cash.app/$mfpstudios/20.00');
  });
});
