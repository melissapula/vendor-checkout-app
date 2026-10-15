// Unit tests for print-order matching (orderImport.ts). Expected values come
// from the rules in orderImport.ts's comments: extraction is generous and
// defaults the quantity to 1, matching is conservative (an exact title
// scores 100, one title containing the other 60, each shared word 10, a
// matching size adds 50, and anything under 40 is no match), and the quick-
// pick list returns the top few candidates whatever their score.
import type { Piece } from '../types/database';
import {
  extractSizeAndQuantity,
  matchPieceForLine,
  topMatchesForLine,
  type ParsedOrderLine,
} from './orderImport';

// pdfjs-dist ships as ESM that uses import.meta, which Jest can't load, and
// the matchers never touch it. orderImport.ts sets GlobalWorkerOptions at
// import time, so the stub needs that one object.
jest.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {} }));

function piece(id: string, title: string, size: string | null = null): Piece {
  return { id, sku: id, title, size, price: 20, type: 'print' } as Piece;
}

function orderLine(guessedTitle: string, guessedSize: string | null = null): ParsedOrderLine {
  return { id: 'line', rawText: guessedTitle, guessedTitle, guessedSize, quantity: 1 };
}

describe('extractSizeAndQuantity', () => {
  test('pulls a WxH size and a labelled quantity out of the title', () => {
    expect(extractSizeAndQuantity('Sunset Over Lake 8x10 qty 3')).toEqual({
      title: 'Sunset Over Lake',
      size: '8x10',
      quantity: 3,
    });
  });

  test('normalizes a spaced size with a multiplication sign and reads a trailing quantity', () => {
    expect(extractSizeAndQuantity('Sunset Over Lake - 8 × 10 - 2')).toEqual({
      title: 'Sunset Over Lake',
      size: '8x10',
      quantity: 2,
    });
  });

  test('recognizes a word size and an x-prefixed quantity', () => {
    expect(extractSizeAndQuantity('Morning Fog Large x2')).toEqual({
      title: 'Morning Fog',
      size: 'Large',
      quantity: 2,
    });
  });

  test('returns a null size when the text has none', () => {
    expect(extractSizeAndQuantity('Morning Fog qty: 4')).toEqual({
      title: 'Morning Fog',
      size: null,
      quantity: 4,
    });
  });

  test('defaults the quantity to 1 when the text has none', () => {
    expect(extractSizeAndQuantity('Morning Fog 5x7')).toEqual({
      title: 'Morning Fog',
      size: '5x7',
      quantity: 1,
    });
  });

  test('treats a quantity of 0 as 1', () => {
    expect(extractSizeAndQuantity('Morning Fog qty 0').quantity).toBe(1);
  });
});

describe('matchPieceForLine', () => {
  const sunset = piece('sunset', 'Sunset Over Lake');
  const fog = piece('fog', 'Morning Fog');

  test('matches an exact title, ignoring case and punctuation', () => {
    expect(matchPieceForLine(orderLine('sunset over lake!'), [fog, sunset])).toBe(sunset);
  });

  test('matches a near-miss title that contains the piece title', () => {
    expect(matchPieceForLine(orderLine('Sunset Over Lake Print'), [fog, sunset])).toBe(sunset);
  });

  test('returns null when the best score is below the floor of 40', () => {
    // Three shared words score 30: a weak guess, so no match.
    expect(matchPieceForLine(orderLine('Lake Over Sunset'), [fog, sunset])).toBeNull();
  });

  test('returns null when no piece shares anything with the line', () => {
    expect(matchPieceForLine(orderLine('Desert Bloom'), [fog, sunset])).toBeNull();
  });

  test('returns null for an empty title or an empty inventory', () => {
    expect(matchPieceForLine(orderLine('  '), [fog, sunset])).toBeNull();
    expect(matchPieceForLine(orderLine('Sunset Over Lake'), [])).toBeNull();
  });

  test('picks the piece whose size matches when titles tie', () => {
    const small = piece('sunset-5x7', 'Sunset Over Lake', '5x7');
    const large = piece('sunset-8x10', 'Sunset Over Lake', '8x10');
    expect(matchPieceForLine(orderLine('Sunset Over Lake', '8x10'), [small, large])).toBe(large);
  });

  test('compares sizes ignoring case', () => {
    const small = piece('sunset-small', 'Sunset Over Lake', 'Small');
    const large = piece('sunset-large', 'Sunset Over Lake', 'Large');
    expect(matchPieceForLine(orderLine('Sunset Over Lake', 'large'), [small, large])).toBe(large);
  });
});

describe('topMatchesForLine', () => {
  const exact = piece('exact', 'Sunset Over Lake');
  const contains = piece('contains', 'Sunset Over Lake Triptych');
  const twoWords = piece('two-words', 'Lake Sunset');
  const oneWord = piece('one-word', 'Lake Superior');
  const unrelated = piece('unrelated', 'Morning Fog');

  test('orders candidates best first and leaves out pieces that share nothing', () => {
    const matches = topMatchesForLine(orderLine('Sunset Over Lake'), [oneWord, unrelated, twoWords, exact, contains], 10);
    expect(matches.map((p) => p.id)).toEqual(['exact', 'contains', 'two-words', 'one-word']);
  });

  test('returns 3 candidates by default', () => {
    const matches = topMatchesForLine(orderLine('Sunset Over Lake'), [oneWord, twoWords, exact, contains]);
    expect(matches.map((p) => p.id)).toEqual(['exact', 'contains', 'two-words']);
  });

  test('respects an explicit limit', () => {
    const matches = topMatchesForLine(orderLine('Sunset Over Lake'), [oneWord, twoWords, exact, contains], 1);
    expect(matches.map((p) => p.id)).toEqual(['exact']);
  });

  test('includes candidates below the match floor', () => {
    expect(topMatchesForLine(orderLine('Sunset Over Lake'), [oneWord]).map((p) => p.id)).toEqual(['one-word']);
  });
});
