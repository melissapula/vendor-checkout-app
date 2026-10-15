// Unit tests for the Avery sheet lookup (labelSizes.ts).
import { labelSizeFor, type LabelSizeKey } from './labelSizes';

describe('labelSizeFor', () => {
  test('returns the spec for a known size', () => {
    const spec = labelSizeFor('avery5163');

    expect(spec.key).toBe('avery5163');
    expect(spec.labelWidthIn).toBe(4);
    expect(spec.labelHeightIn).toBe(2);
    expect(spec.columns * spec.rows).toBe(10);
  });

  test('falls back to Avery 5160 for an unknown size', () => {
    // A saved setting from an older version could hold a key that no longer exists.
    expect(labelSizeFor('avery9999' as LabelSizeKey).key).toBe('avery5160');
  });
});
