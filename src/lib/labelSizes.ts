// Physical specs for each supported Avery sheet — label size, sheet grid,
// and margins, all in inches. Matched against Avery's own published specs
// wherever possible (see the `verified` note on each) rather than guessed,
// since a wrong number here means labels print misaligned on real,
// pre-die-cut sheets — not just a cosmetic bug.
export type LabelSizeKey = 'avery5160' | 'avery5163' | 'avery5390';

export interface LabelSizeSpec {
  key: LabelSizeKey;
  name: string;
  shortName: string;
  labelWidthIn: number;
  labelHeightIn: number;
  columns: number;
  rows: number;
  marginTopIn: number;
  marginSideIn: number;
  columnGapIn: number;
  rowGapIn: number;
  // True when every number below is confirmed against Avery's own published
  // spec. False means the grid was derived by centering the known label
  // size/count on the sheet — should print correctly, but print one test
  // sheet on plain paper and hold it against a real label sheet before
  // running a full batch.
  verified: boolean;
}

export const SHEET_WIDTH_IN = 8.5;
export const SHEET_HEIGHT_IN = 11;

export const LABEL_SIZES: LabelSizeSpec[] = [
  {
    key: 'avery5160',
    name: 'Avery 5160 — 1" × 2⅝" barcode label (30/sheet)',
    shortName: 'Avery 5160 (1" × 2⅝")',
    labelWidthIn: 2.625,
    labelHeightIn: 1,
    columns: 3,
    rows: 10,
    marginTopIn: 0.5,
    marginSideIn: 0.1875,
    columnGapIn: 0.125,
    rowGapIn: 0,
    verified: true,
  },
  {
    key: 'avery5163',
    name: 'Avery 5163 — 2" × 4" large label (10/sheet)',
    shortName: 'Avery 5163 (2" × 4")',
    labelWidthIn: 4,
    labelHeightIn: 2,
    columns: 2,
    rows: 5,
    marginTopIn: 0.5,
    marginSideIn: 0.15,
    columnGapIn: 0.18,
    rowGapIn: 0,
    verified: true,
  },
  {
    key: 'avery5390',
    name: 'Avery 5390 — 2¼" × 3½" name badge insert (8/sheet)',
    shortName: 'Avery 5390 (2¼" × 3½")',
    // Avery lists this as 2-1/4" x 3-1/2" but the sheet is a 2-column x
    // 4-row grid, which only fits an 8.5x11 sheet in landscape orientation
    // (2 x 3.5" = 7" wide, 4 x 2.25" = 9" tall) — portrait would be 4.5"
    // wide x 14" tall, taller than the page itself. Margins aren't
    // published anywhere findable; centering the 7"x9" label grid on the
    // page gives clean, round numbers (0.75" sides, 1" top/bottom, no
    // gaps), but this hasn't been confirmed against a real sheet.
    labelWidthIn: 3.5,
    labelHeightIn: 2.25,
    columns: 2,
    rows: 4,
    marginTopIn: 1,
    marginSideIn: 0.75,
    columnGapIn: 0,
    rowGapIn: 0,
    verified: false,
  },
];

export function labelSizeFor(key: LabelSizeKey): LabelSizeSpec {
  return LABEL_SIZES.find((s) => s.key === key) ?? LABEL_SIZES[0];
}
