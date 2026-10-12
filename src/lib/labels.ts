import { PaymentMethod } from '../types/database';

// How stored values are written out for people. The database keeps short
// machine-friendly values ("cash_app", "original"); screens that list or
// summarise them go through here so a vendor never reads the raw one.
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Card',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cash_app: 'Cash App',
  cash: 'Cash',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? titleCase(method);
}

// Item types are partly free text (a vendor can type their own), so this
// tidies whatever is there rather than looking it up: "original" becomes
// "Original", "greeting_card" becomes "Greeting card".
export function typeLabel(type: string): string {
  return titleCase(type);
}

function titleCase(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value;
}
