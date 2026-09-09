import JsBarcode from 'jsbarcode';

// Web-only (this app is distributed as a web app — see README's "Web
// distribution"): a plain <canvas> + jsbarcode needs no native module at
// all, which a cross-platform SVG barcode library would exist only to
// work around here.
export function renderBarcodeDataUrl(
  value: string,
  options: { height?: number; width?: number; fontSize?: number } = {}
): string | null {
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
    return canvas.toDataURL('image/png');
  } catch {
    // JsBarcode throws on characters CODE128 can't encode — return null
    // rather than crash the screen over an unusual SKU.
    return null;
  }
}
