import JsBarcode from 'jsbarcode';

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
