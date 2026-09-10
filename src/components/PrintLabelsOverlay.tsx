import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Text } from 'react-native';
import { Piece } from '../types/database';
import { renderBarcodeDataUrl } from '../lib/barcode';
import { renderQrDataUrl } from '../lib/payLinks';

export type LabelFields = {
  title: boolean;
  barcode: boolean;
  qr: boolean;
  price: boolean;
  size: boolean;
};

// Renders outside the normal app tree (a sibling of #root under <body>) so
// print CSS can hide the whole app and show only this while printing, then
// restore normal display once the print dialog closes.
//
// Matches Avery 5160 (US Letter, 30 labels/sheet, 3 cols x 10 rows, 1in x
// 2.625in labels, 0.5in top/bottom margin, 0.1875in side margin, 0.125in
// gap between columns, no vertical gap) exactly — verified against Avery's
// own published spec, not guessed. Uses raw DOM elements (div/img) with
// physical `in` CSS units for the grid/sheet layout rather than React
// Native's style system, since RN's StyleSheet has no grid/`@page`/absolute
// physical unit support and this subtree only ever renders on web anyway.
const PRINT_STYLE_ID = 'print-labels-style';
const LABELS_PER_SHEET = 30;
const SHEET_WIDTH_IN = 8.5;
const SHEET_HEIGHT_IN = 11;
const LABEL_WIDTH_IN = 2.625;
const LABEL_HEIGHT_IN = 1;
const MARGIN_TOP_IN = 0.5;
const MARGIN_SIDE_IN = 0.1875;
const COLUMN_GAP_IN = 0.125;

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

function Label({
  piece,
  fields,
  qrDataUrl,
}: {
  piece: Piece;
  fields: LabelFields;
  qrDataUrl?: string | null;
}) {
  const barcodeUri = fields.barcode
    ? renderBarcodeDataUrl(piece.sku, { width: 1.6, height: 26, fontSize: 9 })
    : null;
  const hasSize = piece.width_in != null && piece.height_in != null;

  return (
    <div
      style={{
        width: `${LABEL_WIDTH_IN}in`,
        height: `${LABEL_HEIGHT_IN}in`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '0.06in 0.1in',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {fields.title && (
        <Text style={{ fontSize: 9, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
          {piece.title}
        </Text>
      )}
      {fields.barcode && barcodeUri && (
        // Explicit physical width with height:auto so the browser scales
        // the barcode uniformly (no distortion) to fit the label.
        <img src={barcodeUri} style={{ width: '1.8in', height: 'auto', display: 'block' }} />
      )}
      {fields.qr && qrDataUrl && (
        <img src={qrDataUrl} style={{ width: '0.55in', height: '0.55in', display: 'block' }} />
      )}
      {fields.size && hasSize && (
        <Text style={{ fontSize: 8, color: '#333' }}>
          {piece.width_in}×{piece.height_in}"
        </Text>
      )}
      {fields.price && <Text style={{ fontSize: 9, fontWeight: '600' }}>${piece.price.toFixed(2)}</Text>}
    </div>
  );
}

function Sheet({
  pieces,
  fields,
  qrDataUrls,
  isLast,
}: {
  pieces: Piece[];
  fields: LabelFields;
  qrDataUrls: Map<string, string>;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        width: `${SHEET_WIDTH_IN}in`,
        height: `${SHEET_HEIGHT_IN}in`,
        boxSizing: 'border-box',
        padding: `${MARGIN_TOP_IN}in ${MARGIN_SIDE_IN}in`,
        display: 'grid',
        gridTemplateColumns: `repeat(3, ${LABEL_WIDTH_IN}in)`,
        gridTemplateRows: `repeat(10, ${LABEL_HEIGHT_IN}in)`,
        columnGap: `${COLUMN_GAP_IN}in`,
        rowGap: '0in',
        pageBreakAfter: isLast ? 'auto' : 'always',
      }}
    >
      {pieces.map((p, i) => (
        <Label key={`${p.id}-${i}`} piece={p} fields={fields} qrDataUrl={qrDataUrls.get(p.sku)} />
      ))}
    </div>
  );
}

export default function PrintLabelsOverlay({
  pieces,
  fields,
  onDone,
}: {
  pieces: Piece[] | null;
  fields: LabelFields | null;
  onDone: () => void;
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Map<string, string>>(new Map());
  const [qrReady, setQrReady] = useState(false);

  useEffect(() => {
    ensurePrintStyleInjected();
    setPortalRoot(getPrintRoot());
  }, []);

  // Pre-generate QR codes (one per distinct SKU, deduped) before printing —
  // unlike the barcode renderer, QRCode.toDataURL is async, so printing
  // before these resolve would leave blank QR cells on the sheet.
  useEffect(() => {
    if (!pieces || pieces.length === 0 || !fields) return;
    if (!fields.qr) {
      setQrDataUrls(new Map());
      setQrReady(true);
      return;
    }
    let cancelled = false;
    setQrReady(false);
    const skus = Array.from(new Set(pieces.map((p) => p.sku)));
    Promise.all(skus.map(async (sku) => [sku, await renderQrDataUrl(sku)] as const)).then((entries) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const [sku, dataUrl] of entries) {
        if (dataUrl) map.set(sku, dataUrl);
      }
      setQrDataUrls(map);
      setQrReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pieces, fields]);

  useEffect(() => {
    if (!pieces || pieces.length === 0 || !fields || !qrReady) return;

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
  }, [pieces, fields, qrReady]);

  if (!portalRoot || !pieces || pieces.length === 0 || !fields || !qrReady) return null;

  const sheets = chunk(pieces, LABELS_PER_SHEET);

  return createPortal(
    <>
      {sheets.map((sheetPieces, i) => (
        <Sheet
          key={i}
          pieces={sheetPieces}
          fields={fields}
          qrDataUrls={qrDataUrls}
          isLast={i === sheets.length - 1}
        />
      ))}
    </>,
    portalRoot
  );
}
