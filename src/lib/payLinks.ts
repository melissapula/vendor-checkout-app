import QRCode from 'qrcode';

// Deep-link URL builders for the self-reported payment methods — each
// provider's own documented amount-prefilled pay link, verified directly
// against their docs (not guessed):
//   Venmo:    venmo.com/<user>?txn=pay&amount=<amt>&note=<note>
//   PayPal:   paypal.me/<user>/<amt>
//   Cash App: cash.app/$<cashtag>/<amt>
// The buyer scans with their own phone's camera and confirms in their own
// app — this app never touches the payment itself for these three, same as
// today's self-reported flow, just without the buyer needing to type the
// amount by hand.

export function venmoPayUrl(username: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    txn: 'pay',
    amount: amount.toFixed(2),
    note,
  });
  return `https://venmo.com/${encodeURIComponent(username)}?${params.toString()}`;
}

export function paypalPayUrl(username: string, amount: number): string {
  // PayPal.me only reliably prefills the amount when a currency code is
  // appended directly (no separator) — without it, QR-scan handoffs
  // straight into the PayPal app sometimes drop the amount and land the
  // buyer on a blank "enter amount" screen.
  return `https://paypal.me/${encodeURIComponent(username)}/${amount.toFixed(2)}USD`;
}

export function cashAppPayUrl(cashtag: string, amount: number): string {
  const handle = cashtag.startsWith('$') ? cashtag.slice(1) : cashtag;
  return `https://cash.app/$${encodeURIComponent(handle)}/${amount.toFixed(2)}`;
}

// Web-only (see README's "Web distribution" / "Barcode labels" sections for
// why this app leans on plain browser APIs for generated-image needs rather
// than a cross-platform native library) — mirrors renderBarcodeDataUrl in
// src/lib/barcode.ts.
export async function renderQrDataUrl(value: string): Promise<string | null> {
  if (!value) return null;
  try {
    return await QRCode.toDataURL(value, { margin: 1, width: 320 });
  } catch {
    return null;
  }
}
