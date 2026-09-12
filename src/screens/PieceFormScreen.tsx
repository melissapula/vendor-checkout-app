import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePieces } from '../context/PiecesContext';
import { Piece, PieceStatus, PieceType } from '../types/database';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { appAlert } from '../lib/alert';

const STATUSES: PieceStatus[] = ['available', 'sold', 'reserved'];

// Just quick-fill suggestions for the freely-editable Size field below —
// common print dimensions and the small/medium/large convention for stickers.
const SIZE_SUGGESTIONS: Record<string, string[]> = {
  print: ['4x6', '5x7', '8x10', '11x14', '16x20'],
  sticker: ['Small', 'Medium', 'Large'],
};

// Sensible starting point for a brand-new original — next unused SKU-####.
// Purely a suggestion; the field stays freely editable.
function suggestSku(pieces: Piece[]): string {
  const nums = pieces
    .map((p) => p.sku.match(/^SKU-(\d{4})$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `SKU-${String(next).padStart(4, '0')}`;
}

export default function PieceFormScreen({
  piece,
  presetOriginalId,
  onClose,
}: {
  piece?: Piece;
  presetOriginalId?: string;
  onClose: () => void;
}) {
  const { pieces, addPiece, updatePiece, deletePiece } = usePieces();
  const [submitting, setSubmitting] = useState(false);
  const { isTabletUp } = useBreakpoint();

  const originals = useMemo(() => pieces.filter((p) => p.type === 'original'), [pieces]);
  const knownTypes = useMemo(
    () => Array.from(new Set(pieces.map((p) => p.type))).sort(),
    [pieces]
  );
  const dependents = useMemo(
    () => (piece ? pieces.filter((p) => p.original_id === piece.id) : []),
    [pieces, piece]
  );

  const [title, setTitle] = useState(piece?.title ?? '');
  const [sku, setSku] = useState(piece?.sku ?? (presetOriginalId ? '' : suggestSku(pieces)));
  const [type, setType] = useState<PieceType>(piece?.type ?? (presetOriginalId ? 'print' : 'original'));
  const [customType, setCustomType] = useState(
    piece && !knownTypes.includes(piece.type) ? piece.type : ''
  );
  const [medium, setMedium] = useState(piece?.medium ?? '');
  const [price, setPrice] = useState(piece ? String(piece.price) : '');
  const [quantity, setQuantity] = useState(piece ? String(piece.quantity_remaining) : '1');
  const [status, setStatus] = useState<PieceStatus>(piece?.status ?? 'available');
  const [series, setSeries] = useState(piece?.series ?? '');
  const [size, setSize] = useState(piece?.size ?? '');
  const [widthIn, setWidthIn] = useState(piece?.width_in != null ? String(piece.width_in) : '');
  const [heightIn, setHeightIn] = useState(piece?.height_in != null ? String(piece.height_in) : '');
  const [costBasis, setCostBasis] = useState(piece?.cost_basis != null ? String(piece.cost_basis) : '');
  const [notes, setNotes] = useState(piece?.notes ?? '');
  const [imageUrl, setImageUrl] = useState(piece?.image_url ?? '');
  const [infoUrl, setInfoUrl] = useState(piece?.info_url ?? '');
  const [originalId, setOriginalId] = useState<string | null>(
    piece?.original_id ?? presetOriginalId ?? null
  );
  const [originalSearch, setOriginalSearch] = useState('');

  const filteredOriginals = useMemo(() => {
    const q = originalSearch.trim().toLowerCase();
    const list = q
      ? originals.filter((o) => o.title.toLowerCase().includes(q) || o.sku.toLowerCase().includes(q))
      : originals;
    return list.slice(0, 20);
  }, [originals, originalSearch]);

  const selectedOriginal = originalId ? pieces.find((p) => p.id === originalId) : null;

  function parseOptionalNumber(text: string): number | null {
    if (!text.trim()) return null;
    const n = parseFloat(text);
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    const priceValue = parseFloat(price);
    const quantityValue = parseInt(quantity, 10);
    const resolvedType = type === 'other' ? customType.trim() : type;

    if (!title.trim()) return appAlert('Missing title', 'Give this piece a title.');
    if (!sku.trim()) return appAlert('Missing SKU', 'Every piece needs a unique SKU.');
    if (!resolvedType) return appAlert('Missing type', 'Pick a type or enter a custom one.');
    if (isNaN(priceValue) || priceValue < 0) return appAlert('Invalid price', 'Enter a price of $0 or more.');
    if (isNaN(quantityValue) || quantityValue < 0) {
      return appAlert('Invalid quantity', 'Enter a quantity of 0 or more.');
    }

    const payload = {
      title: title.trim(),
      sku: sku.trim(),
      type: resolvedType,
      medium: medium.trim() || null,
      price: priceValue,
      quantity_remaining: quantityValue,
      status,
      series: series.trim() || null,
      size: size.trim() || null,
      width_in: parseOptionalNumber(widthIn),
      height_in: parseOptionalNumber(heightIn),
      cost_basis: parseOptionalNumber(costBasis),
      notes: notes.trim() || null,
      image_url: imageUrl.trim() || null,
      info_url: infoUrl.trim() || null,
      original_id: originalId,
    };

    setSubmitting(true);
    try {
      if (piece) {
        await updatePiece(piece.id, payload);
      } else {
        await addPiece({
          ...payload,
          print_run_size: null,
          date_sold: null,
          sale_channel: null,
        });
      }
      onClose();
    } catch (err) {
      appAlert('Save failed', err instanceof Error ? err.message : 'Could not save this piece.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!piece) return;
    if (dependents.length > 0) {
      appAlert(
        "Can't delete yet",
        `${dependents.length} item(s) are linked to this as their original ` +
          `(${dependents.map((d) => d.title).join(', ')}). Delete or reassign those first.`
      );
      return;
    }
    appAlert('Delete this piece?', piece.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await deletePiece(piece.id);
            onClose();
          } catch (err) {
            appAlert('Delete failed', err instanceof Error ? err.message : 'Could not delete this piece.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <Text style={styles.heading}>{piece ? 'Edit Piece' : 'New Piece'}</Text>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Loon at Dawn"
          onSubmitEditing={handleSave}
        />

        <Text style={styles.label}>SKU</Text>
        <TextInput
          style={styles.input}
          value={sku}
          onChangeText={setSku}
          placeholder="e.g. SKU-0129"
          autoCapitalize="characters"
          onSubmitEditing={handleSave}
        />

        <Text style={styles.label}>Type</Text>
        <View style={styles.chipRow}>
          {knownTypes.map((t) => (
            <Pressable key={t} style={[styles.chip, type === t && styles.chipSelected]} onPress={() => setType(t)}>
              <Text style={[styles.chipText, type === t && styles.chipTextSelected]}>{t}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.chip, type === 'other' && styles.chipSelected]}
            onPress={() => setType('other')}
          >
            <Text style={[styles.chipText, type === 'other' && styles.chipTextSelected]}>other…</Text>
          </Pressable>
        </View>
        {type === 'other' && (
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={customType}
            onChangeText={setCustomType}
            placeholder="Custom type name"
            onSubmitEditing={handleSave}
          />
        )}

        <Text style={styles.label}>Medium</Text>
        <TextInput
          style={styles.input}
          value={medium}
          onChangeText={setMedium}
          placeholder="e.g. Acrylic on Canvas"
          onSubmitEditing={handleSave}
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Price ($)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              onSubmitEditing={handleSave}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Quantity remaining</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              onSubmitEditing={handleSave}
            />
          </View>
        </View>

        <Text style={styles.label}>Status</Text>
        <View style={styles.chipRow}>
          {STATUSES.map((s) => (
            <Pressable key={s} style={[styles.chip, status === s && styles.chipSelected]} onPress={() => setStatus(s)}>
              <Text style={[styles.chipText, status === s && styles.chipTextSelected]}>{s}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Linked original (for prints/stickers/pins/postcards)</Text>
        {selectedOriginal ? (
          <View style={styles.selectedOriginal}>
            <Text style={styles.selectedOriginalText}>{selectedOriginal.title}</Text>
            <Pressable onPress={() => setOriginalId(null)}>
              <Text style={styles.clearLink}>Clear</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={originalSearch}
              onChangeText={setOriginalSearch}
              placeholder="Search originals by title or SKU…"
            />
            {originalSearch.length > 0 && (
              <View style={styles.searchResults}>
                {filteredOriginals.map((o) => (
                  <Pressable
                    key={o.id}
                    style={styles.searchResultRow}
                    onPress={() => {
                      setOriginalId(o.id);
                      setOriginalSearch('');
                    }}
                  >
                    <Text style={styles.searchResultText}>
                      {o.title} ({o.sku})
                    </Text>
                  </Pressable>
                ))}
                {filteredOriginals.length === 0 && <Text style={styles.meta}>No matches</Text>}
              </View>
            )}
          </>
        )}

        <Text style={styles.label}>Series (optional)</Text>
        <TextInput
          style={styles.input}
          value={series}
          onChangeText={setSeries}
          placeholder="e.g. Northern Skies"
          onSubmitEditing={handleSave}
        />

        <Text style={styles.label}>Size (optional — lets deals target this size)</Text>
        {SIZE_SUGGESTIONS[type] && (
          <View style={[styles.chipRow, { marginBottom: 8 }]}>
            {SIZE_SUGGESTIONS[type].map((s) => (
              <Pressable key={s} style={[styles.chip, size === s && styles.chipSelected]} onPress={() => setSize(s)}>
                <Text style={[styles.chipText, size === s && styles.chipTextSelected]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <TextInput
          style={styles.input}
          value={size}
          onChangeText={setSize}
          placeholder="e.g. 4x6, Small"
          onSubmitEditing={handleSave}
        />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Width (in)</Text>
            <TextInput
              style={styles.input}
              value={widthIn}
              onChangeText={setWidthIn}
              keyboardType="decimal-pad"
              onSubmitEditing={handleSave}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Height (in)</Text>
            <TextInput
              style={styles.input}
              value={heightIn}
              onChangeText={setHeightIn}
              keyboardType="decimal-pad"
              onSubmitEditing={handleSave}
            />
          </View>
        </View>

        <Text style={styles.label}>Cost basis ($, optional)</Text>
        <TextInput
          style={styles.input}
          value={costBasis}
          onChangeText={setCostBasis}
          keyboardType="decimal-pad"
          onSubmitEditing={handleSave}
        />

        <Text style={styles.label}>Image URL (optional)</Text>
        <TextInput
          style={styles.input}
          value={imageUrl}
          onChangeText={setImageUrl}
          placeholder="https://…"
          autoCapitalize="none"
          onSubmitEditing={handleSave}
        />

        <Text style={styles.label}>Link (optional, for label QR codes)</Text>
        <TextInput
          style={styles.input}
          value={infoUrl}
          onChangeText={setInfoUrl}
          placeholder="https://yoursite.com/gallery/this-piece"
          autoCapitalize="none"
          onSubmitEditing={handleSave}
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </ScrollView>

      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </Pressable>
        {piece && (
          <Pressable disabled={submitting} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete piece</Text>
          </Pressable>
        )}
        <Pressable disabled={submitting} onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 16 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  meta: { fontSize: 13, color: '#666', padding: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f0f0' },
  chipSelected: { backgroundColor: '#1a1a1a' },
  chipText: { fontWeight: '600', color: '#1a1a1a' },
  chipTextSelected: { color: '#fff' },
  selectedOriginal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedOriginalText: { fontSize: 15, fontWeight: '600' },
  clearLink: { color: '#b00020', fontSize: 13 },
  searchResults: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 8, maxHeight: 160 },
  searchResultRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  searchResultText: { fontSize: 14 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  saveButton: { backgroundColor: '#1a1a1a', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteText: { textAlign: 'center', color: '#b00020', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666' },
});
