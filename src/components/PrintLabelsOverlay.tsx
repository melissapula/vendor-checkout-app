import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Text } from 'react-native';
import { Piece } from '../types/database';
import { renderBarcodeDataUrl } from '../lib/barcode';

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

function Label({ piece }: { piece: Piece }) {
  const barcodeUri = renderBarcodeDataUrl(piece.sku, { width: 2, height: 34, fontSize: 10 });

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
      <Text style={{ fontSize: 9, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>
        {piece.title}
      </Text>
      {barcodeUri && (
        // Explicit physical width with height:auto so the browser scales
        // the barcode uniformly (no distortion) to fit the label.
        <img src={barcodeUri} style={{ width: '2.2in', height: 'auto', display: 'block' }} />
      )}
      <Text style={{ fontSize: 9, fontWeight: '600' }}>${piece.price.toFixed(2)}</Text>
    </div>
  );
}

function Sheet({ pieces, isLast }: { pieces: Piece[]; isLast: boolean }) {
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
      {pieces.map((p) => (
        <Label key={p.id} piece={p} />
      ))}
    </div>
  );
}

export default function PrintLabelsOverlay({
  pieces,
  onDone,
}: {
  pieces: Piece[] | null;
  onDone: () => void;
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    ensurePrintStyleInjected();
    setPortalRoot(getPrintRoot());
  }, []);

  useEffect(() => {
    if (!pieces || pieces.length === 0) return;

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
  }, [pieces]);

  if (!portalRoot || !pieces || pieces.length === 0) return null;

  const sheets = chunk(pieces, LABELS_PER_SHEET);

  return createPortal(
    <>
      {sheets.map((sheetPieces, i) => (
        <Sheet key={i} pieces={sheetPieces} isLast={i === sheets.length - 1} />
      ))}
    </>,
    portalRoot
  );
}
