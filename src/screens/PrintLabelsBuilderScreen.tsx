import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Piece } from '../types/database';
import { usePieces } from '../context/PiecesContext';
import { thumbUrl } from '../lib/images';
import { LabelFields } from '../components/PrintLabelsOverlay';
import { LABEL_SIZES, LabelSizeKey, labelSizeFor } from '../lib/labelSizes';
import { appAlert } from '../lib/alert';

type QueueEntry = { piece: Piece; quantity: number };

const FIELD_OPTIONS: { key: keyof LabelFields; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'qr', label: 'Scan-to-cart QR' },
  { key: 'link', label: 'Read-more QR' },
  { key: 'price', label: 'Price' },
  { key: 'size', label: 'Size' },
];

type LabelType = 'barcode' | 'nametag';

const LABEL_TYPE_OPTIONS: { key: LabelType; label: string; fields: LabelFields; size: LabelSizeKey }[] = [
  {
    key: 'barcode',
    label: 'Barcode label',
    fields: { title: true, barcode: true, qr: false, link: false, price: true, size: false },
    size: 'avery5160',
  },
  {
    key: 'nametag',
    label: 'Name tag (for hanging)',
    fields: { title: true, barcode: false, qr: false, link: true, price: true, size: true },
    size: 'avery5390',
  },
];

const DEFAULT_TYPE: LabelType = 'barcode';
const DEFAULT_FIELDS: LabelFields = LABEL_TYPE_OPTIONS[0].fields;
const DEFAULT_SIZE: LabelSizeKey = LABEL_TYPE_OPTIONS[0].size;

function SearchResultRow({ piece, onAdd }: { piece: Piece; onAdd: () => void }) {
  return (
    <View style={styles.searchRow}>
      {piece.image_url ? (
        <Image source={{ uri: thumbUrl(piece.image_url) }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
      <View style={styles.searchRowInfo}>
        <Text style={styles.title}>{piece.title}</Text>
        <Text style={styles.meta}>{piece.sku}</Text>
      </View>
      <Pressable style={styles.addButton} onPress={onAdd}>
        <Text style={styles.addButtonText}>Add</Text>
      </Pressable>
    </View>
  );
}

function QueueRow({
  entry,
  onUpdateQuantity,
  onRemove,
}: {
  entry: QueueEntry;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.queueRow}>
      {entry.piece.image_url ? (
        <Image source={{ uri: thumbUrl(entry.piece.image_url) }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
      <View style={styles.searchRowInfo}>
        <Text style={styles.title}>{entry.piece.title}</Text>
        <Text style={styles.meta}>{entry.piece.sku}</Text>
      </View>
      <View style={styles.qtyControls}>
        <Pressable style={styles.qtyButton} onPress={() => onUpdateQuantity(entry.quantity - 1)}>
          <Text style={styles.qtyButtonText}>−</Text>
        </Pressable>
        <Text style={styles.qty}>{entry.quantity}</Text>
        <Pressable style={styles.qtyButton} onPress={() => onUpdateQuantity(entry.quantity + 1)}>
          <Text style={styles.qtyButtonText}>+</Text>
        </Pressable>
      </View>
      <Pressable onPress={onRemove}>
        <Text style={styles.remove}>Remove</Text>
      </Pressable>
    </View>
  );
}

export default function PrintLabelsBuilderScreen({
  initialPiece,
  onClose,
  onPrint,
}: {
  initialPiece?: Piece;
  onClose: () => void;
  onPrint: (pieces: Piece[], fields: LabelFields, sizeKey: LabelSizeKey) => void;
}) {
  const { pieces } = usePieces();
  const [labelType, setLabelType] = useState<LabelType>(DEFAULT_TYPE);
  const [fields, setFields] = useState<LabelFields>(DEFAULT_FIELDS);
  const [sizeKey, setSizeKey] = useState<LabelSizeKey>(DEFAULT_SIZE);
  const [entries, setEntries] = useState<QueueEntry[]>(
    initialPiece ? [{ piece: initialPiece, quantity: 1 }] : []
  );
  const [search, setSearch] = useState('');

  // A queued entry's `piece` is a snapshot from whenever it was added — but
  // the Edit form and this builder can be open at the same time (see
  // AppModal.tsx's note on that), so a price/title edit made while a piece
  // is already sitting in the queue would otherwise print with stale data.
  // Re-sync against PiecesContext's live data any time it changes; a piece
  // deleted outright while queued is dropped the same way CartContext drops
  // a cart line for a piece that no longer exists.
  useEffect(() => {
    setEntries((prev) =>
      prev.flatMap((entry) => {
        const live = pieces.find((p) => p.id === entry.piece.id);
        return live ? [{ ...entry, piece: live }] : [];
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces]);

  // Always browsable, not just search-as-you-type: an empty query shows
  // every piece (sorted, capped so the list stays scrollable rather than
  // huge) instead of nothing, so a vendor isn't stuck needing to already
  // know the exact title/SKU they want before anything shows up.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = q
      ? pieces.filter((p) => p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : pieces;
    const sorted = [...matches].sort((a, b) => a.title.localeCompare(b.title));
    const cap = q ? 20 : 50;
    return { results: sorted.slice(0, cap), total: sorted.length, cap };
  }, [pieces, search]);

  const totalLabels = entries.reduce((sum, e) => sum + e.quantity, 0);
  const selectedSize = labelSizeFor(sizeKey);

  function selectLabelType(type: LabelType) {
    const preset = LABEL_TYPE_OPTIONS.find((t) => t.key === type)!;
    setLabelType(type);
    setFields(preset.fields);
    setSizeKey(preset.size);
  }

  function toggleField(key: keyof LabelFields) {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function addPiece(piece: Piece) {
    setEntries((prev) => {
      const existing = prev.find((e) => e.piece.id === piece.id);
      if (existing) {
        return prev.map((e) => (e.piece.id === piece.id ? { ...e, quantity: e.quantity + 1 } : e));
      }
      return [...prev, { piece, quantity: 1 }];
    });
  }

  function updateQuantity(pieceId: string, quantity: number) {
    setEntries((prev) => {
      if (quantity <= 0) return prev.filter((e) => e.piece.id !== pieceId);
      return prev.map((e) => (e.piece.id === pieceId ? { ...e, quantity } : e));
    });
  }

  function removeEntry(pieceId: string) {
    setEntries((prev) => prev.filter((e) => e.piece.id !== pieceId));
  }

  // Queues one barcode per unit currently in stock, for every piece in the
  // catalog — meant for a vendor bulk-labeling their whole starting
  // inventory rather than hunting down and adding each piece by hand. Out
  // of stock pieces are skipped (nothing to label). Merges with whatever's
  // already queued rather than replacing it outright, so it composes with
  // manual additions instead of discarding them.
  function addEntireInventory() {
    const inStock = pieces.filter((p) => p.quantity_remaining > 0);
    const totalLabels = inStock.reduce((sum, p) => sum + p.quantity_remaining, 0);
    if (inStock.length === 0) {
      appAlert('Nothing in stock', 'No pieces currently have stock to label.');
      return;
    }
    appAlert(
      'Add entire inventory?',
      `This queues a barcode for every unit in stock — ${inStock.length} piece${inStock.length === 1 ? '' : 's'}, ${totalLabels} label${totalLabels === 1 ? '' : 's'} total. You can still remove or adjust items before printing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add All',
          onPress: () => {
            setEntries((prev) => {
              const byId = new Map(prev.map((e) => [e.piece.id, e]));
              for (const piece of inStock) {
                byId.set(piece.id, { piece, quantity: piece.quantity_remaining });
              }
              return Array.from(byId.values());
            });
          },
        },
      ]
    );
  }

  function handlePrint() {
    const flat = entries.flatMap((e) => Array(e.quantity).fill(e.piece));
    onPrint(flat, fields, sizeKey);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Print Labels</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Label type</Text>
        <View style={styles.chipRow}>
          {LABEL_TYPE_OPTIONS.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.chip, labelType === t.key && styles.chipSelected]}
              onPress={() => selectLabelType(t.key)}
            >
              <Text style={[styles.chipText, labelType === t.key && styles.chipTextSelected]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Label size</Text>
        <View style={styles.chipRow}>
          {LABEL_SIZES.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.chip, sizeKey === s.key && styles.chipSelected]}
              onPress={() => setSizeKey(s.key)}
            >
              <Text style={[styles.chipText, sizeKey === s.key && styles.chipTextSelected]}>
                {s.shortName}
              </Text>
            </Pressable>
          ))}
        </View>
        {!selectedSize.verified && (
          <Text style={styles.helperText}>
            This size's margins were computed, not confirmed against Avery's own spec — print one test sheet
            on plain paper and check it against a real label sheet before printing a full batch.
          </Text>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Fields on each label</Text>
        <View style={styles.chipRow}>
          {FIELD_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.chip, fields[opt.key] && styles.chipSelected]}
              onPress={() => toggleField(opt.key)}
            >
              <Text style={[styles.chipText, fields[opt.key] && styles.chipTextSelected]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Add pieces</Text>
          <Pressable onPress={addEntireInventory}>
            <Text style={styles.link}>+ Add entire inventory</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by title or SKU, or browse below"
        />
        <ScrollView style={styles.searchResults} nestedScrollEnabled>
          {searchResults.results.map((p) => (
            <SearchResultRow key={p.id} piece={p} onAdd={() => addPiece(p)} />
          ))}
          {searchResults.results.length === 0 && (
            <Text style={styles.noResults}>No pieces match "{search}".</Text>
          )}
        </ScrollView>
        {searchResults.total > searchResults.cap && (
          <Text style={styles.helperText}>
            Showing {searchResults.cap} of {searchResults.total} — type to narrow the list.
          </Text>
        )}
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Search above and add the pieces you want to print labels for.</Text>
        </View>
      ) : (
        <View>
          {entries.map((entry, i) => (
            <React.Fragment key={entry.piece.id}>
              {i > 0 && <View style={styles.separator} />}
              <QueueRow
                entry={entry}
                onUpdateQuantity={(q) => updateQuantity(entry.piece.id, q)}
                onRemove={() => removeEntry(entry.piece.id)}
              />
            </React.Fragment>
          ))}
        </View>
      )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.totalText}>{totalLabels} label{totalLabels === 1 ? '' : 's'} total</Text>
        <Pressable
          style={[styles.printButton, totalLabels === 0 && styles.printButtonDisabled]}
          disabled={totalLabels === 0}
          onPress={handlePrint}
        >
          <Text style={styles.printButtonText}>Print {totalLabels} Label{totalLabels === 1 ? '' : 's'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  cancel: { color: '#666', fontSize: 15 },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1 },
  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#666', textTransform: 'uppercase' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 13, color: '#1a1a1a', fontWeight: '600', textDecorationLine: 'underline' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  chipText: { fontSize: 14, color: '#333', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  searchResults: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, maxHeight: 240 },
  noResults: { color: '#999', fontSize: 13, padding: 14, textAlign: 'center' },
  helperText: { fontSize: 12, color: '#888' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  searchRowInfo: { flex: 1 },
  thumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#f0f0f0' },
  thumbPlaceholder: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#f0f0f0' },
  title: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  addButton: { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center' },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonText: { fontSize: 16, fontWeight: '600' },
  qty: { minWidth: 24, textAlign: 'center', fontWeight: '600' },
  remove: { color: '#b00020', fontSize: 12 },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 16,
    gap: 10,
  },
  totalText: { fontSize: 14, color: '#666', textAlign: 'center' },
  printButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  printButtonDisabled: { backgroundColor: '#ccc' },
  printButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
