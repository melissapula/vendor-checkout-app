import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Text } from 'react-native';
import { Piece } from '../types/database';
import { renderBarcodeDataUrl } from '../lib/barcode';
import { renderQrDataUrl } from '../lib/payLinks';
import { LabelSizeSpec, SHEET_WIDTH_IN, SHEET_HEIGHT_IN } from '../lib/labelSizes';

export type LabelFields = {
  title: boolean;
  barcode: boolean;
  // Scan-to-cart QR — encodes the piece's SKU, same value the barcode
  // carries, for staff/buyer scanning during checkout.
  qr: boolean;
  // "Read more" QR — encodes the piece's own info_url (set on the piece
  // form), for a customer's own phone to open somewhere with more detail.
  // Silently omitted for any piece that has no info_url set, same as
  // `size` silently omits for a piece with no width/height.
  link: boolean;
  price: boolean;
  size: boolean;
};

// Renders outside the normal app tree (a sibling of #root under <body>) so
// print CSS can hide the whole app and show only this while printing, then
// restore normal display once the print dialog closes.
const PRINT_STYLE_ID = 'print-labels-style';

function ensurePrintStyleInjected() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    #print-labels-root { display: none; }
    @media print {
      @page { size: letter; margin: 0; }
      body > #root { display: none !important; }
      #print-labels-root { display: block !important; }
    }
  `;
  document.head.appendChild(style);
}

function getPrintRoot(): HTMLElement {
  let el = document.getElementById('print-labels-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'print-labels-root';
    document.body.appendChild(el);
  }
  return el;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Font/image sizes below were tuned against the original 1in-tall Avery
// 5160 label — scale them up for taller label sizes so a 2in or 2.25in
// label doesn't end up with tiny text lost in empty space.
function Label({
  piece,
  fields,
  size,
  skuQrDataUrl,
  linkQrDataUrl,
}: {
  piece: Piece;
  fields: LabelFields;
  size: LabelSizeSpec;
  skuQrDataUrl?: string | null;
  linkQrDataUrl?: string | null;
}) {
  const scale = size.labelHeightIn / 1;
  const barcodeUri = fields.barcode
    ? renderBarcodeDataUrl(piece.sku, { width: 1.6, height: 26, fontSize: 9 })
    : null;
  const hasSize = piece.width_in != null && piece.height_in != null;
  const hasLink = !!piece.info_url;

  return (
    <div
      style={{
        width: `${size.labelWidthIn}in`,
        height: `${size.labelHeightIn}in`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: `${0.06 * scale}in ${0.1 * scale}in`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${0.03 * scale}in`,
      }}
    >
      {fields.title && (
        <Text style={{ fontSize: 9 * scale, fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
          {piece.title}
        </Text>
      )}
      {fields.barcode && barcodeUri && (
        // Explicit physical width with height:auto so the browser scales
        // the barcode uniformly (no distortion) to fit the label.
        <img src={barcodeUri} style={{ width: `${1.8 * scale}in`, height: 'auto', display: 'block' }} />
      )}
      {fields.qr && skuQrDataUrl && (
        <img src={skuQrDataUrl} style={{ width: `${0.55 * scale}in`, height: `${0.55 * scale}in`, display: 'block' }} />
      )}
      {fields.link && hasLink && linkQrDataUrl && (
        <img src={linkQrDataUrl} style={{ width: `${0.55 * scale}in`, height: `${0.55 * scale}in`, display: 'block' }} />
      )}
      {fields.size && hasSize && (
        <Text style={{ fontSize: 8 * scale, color: '#333' }}>
          {piece.width_in}×{piece.height_in}"
        </Text>
      )}
      {fields.price && <Text style={{ fontSize: 9 * scale, fontWeight: '600' }}>${piece.price.toFixed(2)}</Text>}
    </div>
  );
}

function Sheet({
  pieces,
  fields,
  size,
  skuQrDataUrls,
  linkQrDataUrls,
  isLast,
}: {
  pieces: Piece[];
  fields: LabelFields;
  size: LabelSizeSpec;
  skuQrDataUrls: Map<string, string>;
  linkQrDataUrls: Map<string, string>;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        width: `${SHEET_WIDTH_IN}in`,
        height: `${SHEET_HEIGHT_IN}in`,
        boxSizing: 'border-box',
        padding: `${size.marginTopIn}in ${size.marginSideIn}in`,
        display: 'grid',
        gridTemplateColumns: `repeat(${size.columns}, ${size.labelWidthIn}in)`,
        gridTemplateRows: `repeat(${size.rows}, ${size.labelHeightIn}in)`,
        columnGap: `${size.columnGapIn}in`,
        rowGap: `${size.rowGapIn}in`,
        pageBreakAfter: isLast ? 'auto' : 'always',
      }}
    >
      {pieces.map((p, i) => (
        <Label
          key={`${p.id}-${i}`}
          piece={p}
          fields={fields}
          size={size}
          skuQrDataUrl={skuQrDataUrls.get(p.sku)}
          linkQrDataUrl={p.info_url ? linkQrDataUrls.get(p.info_url) : null}
        />
      ))}
    </div>
  );
}

export default function PrintLabelsOverlay({
  pieces,
  fields,
  size,
  onDone,
}: {
  pieces: Piece[] | null;
  fields: LabelFields | null;
  size: LabelSizeSpec | null;
  onDone: () => void;
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [skuQrDataUrls, setSkuQrDataUrls] = useState<Map<string, string>>(new Map());
  const [linkQrDataUrls, setLinkQrDataUrls] = useState<Map<string, string>>(new Map());
  const [qrReady, setQrReady] = useState(false);

  useEffect(() => {
    ensurePrintStyleInjected();
    setPortalRoot(getPrintRoot());
  }, []);

  // Pre-generate QR codes (one per distinct value, deduped) before printing
  // — unlike the barcode renderer, QRCode.toDataURL is async, so printing
  // before these resolve would leave blank QR cells on the sheet.
  useEffect(() => {
    if (!pieces || pieces.length === 0 || !fields) return;
    if (!fields.qr && !fields.link) {
      setSkuQrDataUrls(new Map());
      setLinkQrDataUrls(new Map());
      setQrReady(true);
      return;
    }
    let cancelled = false;
    setQrReady(false);

    const skus = fields.qr ? Array.from(new Set(pieces.map((p) => p.sku))) : [];
    const links = fields.link
      ? Array.from(new Set(pieces.map((p) => p.info_url).filter((u): u is string => !!u)))
      : [];

    Promise.all([
      Promise.all(skus.map(async (sku) => [sku, await renderQrDataUrl(sku)] as const)),
      Promise.all(links.map(async (url) => [url, await renderQrDataUrl(url)] as const)),
    ]).then(([skuEntries, linkEntries]) => {
      if (cancelled) return;
      const skuMap = new Map<string, string>();
      for (const [sku, dataUrl] of skuEntries) {
        if (dataUrl) skuMap.set(sku, dataUrl);
      }
      const linkMap = new Map<string, string>();
      for (const [url, dataUrl] of linkEntries) {
        if (dataUrl) linkMap.set(url, dataUrl);
      }
      setSkuQrDataUrls(skuMap);
      setLinkQrDataUrls(linkMap);
      setQrReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pieces, fields]);

  useEffect(() => {
    if (!pieces || pieces.length === 0 || !fields || !size || !qrReady) return;

    function handleAfterPrint() {
      onDone();
    }
    window.addEventListener('afterprint', handleAfterPrint);
    // Let the portal content paint before opening the print dialog.
    const timer = setTimeout(() => window.print(), 50);

    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, fields, size, qrReady]);

  if (!portalRoot || !pieces || pieces.length === 0 || !fields || !size || !qrReady) return null;

  const labelsPerSheet = size.columns * size.rows;
  const sheets = chunk(pieces, labelsPerSheet);

  return createPortal(
    <>
      {sheets.map((sheetPieces, i) => (
        <Sheet
          key={i}
          pieces={sheetPieces}
          fields={fields}
          size={size}
          skuQrDataUrls={skuQrDataUrls}
          linkQrDataUrls={linkQrDataUrls}
          isLast={i === sheets.length - 1}
        />
      ))}
    </>,
    portalRoot
  );
}
