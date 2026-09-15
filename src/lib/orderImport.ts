import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import { Piece } from '../types/database';

// Must be served as a static asset at this exact path (copied into
// public/pdf.worker.min.mjs from node_modules/pdfjs-dist/build/ — see that
// file's own header comment). pdfjs is strict about the worker's version
// matching the main library's, so if pdfjs-dist is ever upgraded, re-copy
// the worker file too or PDF parsing will throw at runtime.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface ParsedOrderLine {
  id: string;
  rawText: string;
  guessedTitle: string;
  guessedSize: string | null;
  quantity: number;
}

const COLUMN_ALIASES = {
  title: ['title', 'name', 'item', 'painting', 'artwork', 'description', 'product'],
  size: ['size', 'dimensions', 'variant'],
  quantity: ['qty', 'quantity', 'count', 'ordered', 'amount'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));
  for (const alias of aliases) {
    const normAlias = normalizeHeader(alias);
    const found = normalized.find((h) => h.norm === normAlias);
    if (found) return found.original;
  }
  return null;
}

const SIZE_PATTERN = /\b(\d{1,2})\s?[x×]\s?(\d{1,2})\b/i;
const WORD_SIZES = ['small', 'medium', 'large'];

// Best-effort split of one line of free text into a title, a size (if any
// WxH or small/medium/large token is present), and a quantity — order
// confirmations vary too much in layout to parse exactly, so this is
// deliberately generous; the review step in ImportPrintOrderScreen is the
// real correctness backstop, not this function.
export function extractSizeAndQuantity(text: string): { title: string; size: string | null; quantity: number } {
  let remaining = text;
  let size: string | null = null;

  const sizeMatch = remaining.match(SIZE_PATTERN);
  if (sizeMatch) {
    size = `${sizeMatch[1]}x${sizeMatch[2]}`;
    remaining = remaining.replace(sizeMatch[0], ' ');
  } else {
    const lower = remaining.toLowerCase();
    for (const w of WORD_SIZES) {
      const idx = lower.indexOf(w);
      if (idx !== -1) {
        size = w[0].toUpperCase() + w.slice(1);
        remaining = remaining.slice(0, idx) + remaining.slice(idx + w.length);
        break;
      }
    }
  }

  let quantity = 1;
  const qtyLabelMatch = remaining.match(/\b(?:qty|quantity)[:\s]*([0-9]{1,4})\b/i);
  if (qtyLabelMatch) {
    quantity = parseInt(qtyLabelMatch[1], 10);
    remaining = remaining.replace(qtyLabelMatch[0], ' ');
  } else {
    const xQtyMatch = remaining.match(/\bx\s*([0-9]{1,4})\b/i);
    if (xQtyMatch) {
      quantity = parseInt(xQtyMatch[1], 10);
      remaining = remaining.replace(xQtyMatch[0], ' ');
    } else {
      const trailingNum = remaining.match(/(?:^|\s)([0-9]{1,4})\s*$/);
      if (trailingNum && trailingNum.index != null) {
        quantity = parseInt(trailingNum[1], 10);
        remaining = remaining.slice(0, trailingNum.index);
      }
    }
  }

  const title = remaining.replace(/[-–—|,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, size, quantity: quantity > 0 ? quantity : 1 };
}

export async function parseCsvOrderFile(file: File): Promise<ParsedOrderLine[]> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  const titleCol = findColumn(headers, COLUMN_ALIASES.title);
  const sizeCol = findColumn(headers, COLUMN_ALIASES.size);
  const qtyCol = findColumn(headers, COLUMN_ALIASES.quantity);

  return result.data
    .map((row, i) => {
      const rawTitle = (titleCol ? row[titleCol] : null) ?? Object.values(row).join(' ');
      const rawSize = sizeCol ? row[sizeCol] : undefined;
      const rawQty = qtyCol ? row[qtyCol] : undefined;
      const extracted = extractSizeAndQuantity(rawTitle ?? '');
      const qtyNum = rawQty != null ? parseInt(rawQty, 10) : NaN;
      return {
        id: `csv-${i}`,
        rawText: Object.values(row).filter(Boolean).join(' | '),
        guessedTitle: (titleCol ? rawTitle : extracted.title)?.trim() || extracted.title,
        guessedSize: (rawSize && rawSize.trim()) || extracted.size,
        quantity: !isNaN(qtyNum) && qtyNum > 0 ? qtyNum : extracted.quantity,
      };
    })
    .filter((l) => l.guessedTitle);
}

export async function parsePdfOrderFile(file: File): Promise<ParsedOrderLine[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Text items come back individually positioned, not pre-grouped into
    // lines — bucket by rounded y (line) then order by x (left to right)
    // to reconstruct reading order.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const bucket = rows.get(y) ?? [];
      bucket.push({ x, str: item.str });
      rows.set(y, bucket);
    }

    const sortedYs = Array.from(rows.keys()).sort((a, b) => b - a); // top of page first
    for (const y of sortedYs) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) lines.push(line);
    }
  }

  return lines
    .map((line, i) => {
      const extracted = extractSizeAndQuantity(line);
      return { id: `pdf-${i}`, rawText: line, guessedTitle: extracted.title, guessedSize: extracted.size, quantity: extracted.quantity };
    })
    .filter((l) => l.guessedTitle.length >= 3);
}

export async function parseOrderFile(file: File): Promise<ParsedOrderLine[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') return parseCsvOrderFile(file);
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return parsePdfOrderFile(file);
  throw new Error('Unsupported file type — upload a .csv or .pdf file.');
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Fuzzy-scores every piece against a parsed line's guessed title (+ a bonus
// for a matching size) and returns the best match above a confidence floor
// — deliberately conservative (returns null rather than a weak guess),
// since ImportPrintOrderScreen's review step is where the vendor confirms
// or overrides every match before anything touches inventory.
function scoreCandidates(line: ParsedOrderLine, pieces: Piece[]): { piece: Piece; score: number }[] {
  const normLineTitle = normalizeTitle(line.guessedTitle);
  if (!normLineTitle) return [];

  const scored: { piece: Piece; score: number }[] = [];
  for (const piece of pieces) {
    const normPieceTitle = normalizeTitle(piece.title);
    if (!normPieceTitle) continue;

    let score = 0;
    if (normPieceTitle === normLineTitle) {
      score += 100;
    } else if (normPieceTitle.includes(normLineTitle) || normLineTitle.includes(normPieceTitle)) {
      score += 60;
    } else {
      const lineWords = new Set(normLineTitle.split(' '));
      const overlap = normPieceTitle.split(' ').filter((w) => lineWords.has(w)).length;
      score += overlap * 10;
    }

    if (line.guessedSize && piece.size && piece.size.toLowerCase() === line.guessedSize.toLowerCase()) {
      score += 50;
    }

    if (score > 0) scored.push({ piece, score });
  }

  return scored.sort((a, b) => b.score - a.score);
}

// Deliberately conservative (returns null rather than a weak guess) — the
// review step in ImportPrintOrderScreen is where the vendor confirms or
// overrides every match before anything touches inventory.
export function matchPieceForLine(line: ParsedOrderLine, pieces: Piece[]): Piece | null {
  const best = scoreCandidates(line, pieces)[0];
  return best && best.score >= 40 ? best.piece : null;
}

// Top few candidates regardless of confidence — used by the review screen's
// per-row quick-pick chips, since the single best guess is sometimes wrong
// and the vendor needs real alternatives to tap instead of falling straight
// to a full search.
export function topMatchesForLine(line: ParsedOrderLine, pieces: Piece[], limit = 3): Piece[] {
  return scoreCandidates(line, pieces)
    .slice(0, limit)
    .map((s) => s.piece);
}
