// Unit tests for the human-readable labels (labels.ts).
import { paymentMethodLabel, typeLabel } from './labels';

describe('paymentMethodLabel', () => {
  // The brand spellings are the point: a plain title-case would give
  // "Paypal" and "Cash app".
  test.each([
    ['card', 'Card'],
    ['venmo', 'Venmo'],
    ['paypal', 'PayPal'],
    ['cash_app', 'Cash App'],
    ['cash', 'Cash'],
  ])('%s is shown as %s', (method, expected) => {
    expect(paymentMethodLabel(method)).toBe(expected);
  });

  test('an unknown method is tidied rather than shown raw', () => {
    expect(paymentMethodLabel('apple_pay')).toBe('Apple pay');
  });
});

describe('typeLabel', () => {
  test('turns a stored type into a sentence-case label', () => {
    expect(typeLabel('original')).toBe('Original');
    expect(typeLabel('greeting_card')).toBe('Greeting card');
  });
});
