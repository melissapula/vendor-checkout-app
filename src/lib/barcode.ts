import JsBarcode from 'jsbarcode';

// A barcode printed at a fixed physical width regardless of content length
// packs a long SKU's bars in well below what a phone camera (or the naked
// eye) can reliably resolve — see PrintLabelsOverlay.tsx's fuller note.
// Anything that prints a barcode (the label sheets, and the inventory PDF)
// should size it from its actual pixel width at this fixed physical bar
// width, so bar width — the thing that actually determines scanability —
// stays constant and the barcode just gets physically wider for longer
// SKUs instead.
export const BARCODE_MODULE_WIDTH_PX = 1.6; // passed to JsBarcode as `width` below
export const BARCODE_TARGET_MODULE_WIDTH_IN = 0.013; // ~0.33mm — safe for handheld/phone scanning
export const BARCODE_IN_PER_PX = BARCODE_TARGET_MODULE_WIDTH_IN / BARCODE_MODULE_WIDTH_PX;

export interface BarcodeRender {
  dataUrl: string;
  // The canvas's actual pixel dimensions — the caller needs these to print
  // the barcode at a physical size that keeps bar width constant (see the
  // note on why in PrintLabelsOverlay.tsx), rather than stretching every
  // barcode to the same fixed width regardless of how long the value is.
  widthPx: number;
  heightPx: number;
}

// Web-only (this app is distributed as a web app — see README's "Web
// distribution"): a plain <canvas> + jsbarcode needs no native module at
// all, which a cross-platform SVG barcode library would exist only to
// work around here.
export function renderBarcode(
  value: string,
  options: { height?: number; width?: number; fontSize?: number } = {}
): BarcodeRender | null {
  if (!value) return null;
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, value, {
      format: 'CODE128',
      displayValue: true,
      fontSize: options.fontSize ?? 14,
      width: options.width ?? 2,
      height: options.height ?? 50,
      margin: 6,
    });
    return { dataUrl: canvas.toDataURL('image/png'), widthPx: canvas.width, heightPx: canvas.height };
  } catch {
    // JsBarcode throws on characters CODE128 can't encode — return null
    // rather than crash the screen over an unusual SKU.
    return null;
  }
}
