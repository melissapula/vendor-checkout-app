import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Piece } from '../types/database';
import { usePieces } from '../context/PiecesContext';
import { thumbUrl } from '../lib/images';
import { LabelFields } from '../components/PrintLabelsOverlay';

type QueueEntry = { piece: Piece; quantity: number };

const FIELD_OPTIONS: { key: keyof LabelFields; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'qr', label: 'QR Code' },
  { key: 'price', label: 'Price' },
  { key: 'size', label: 'Size' },
];

const DEFAULT_FIELDS: LabelFields = { title: true, barcode: true, price: true, qr: false, size: false };

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
  onPrint: (pieces: Piece[], fields: LabelFields) => void;
}) {
  const { pieces } = usePieces();
  const [fields, setFields] = useState<LabelFields>(DEFAULT_FIELDS);
  const [entries, setEntries] = useState<QueueEntry[]>(
    initialPiece ? [{ piece: initialPiece, quantity: 1 }] : []
  );
  const [search, setSearch] = useState('');

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return pieces
      .filter((p) => p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 20);
  }, [pieces, search]);

  const totalLabels = entries.reduce((sum, e) => sum + e.quantity, 0);

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

  function handlePrint() {
    const flat = entries.flatMap((e) => Array(e.quantity).fill(e.piece));
    onPrint(flat, fields);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Print Labels</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Label info</Text>
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
        <Text style={styles.sectionLabel}>Add pieces</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by title or SKU"
        />
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((p) => (
              <SearchResultRow key={p.id} piece={p} onAdd={() => addPiece(p)} />
            ))}
          </View>
        )}
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Search above and add the pieces you want to print labels for.</Text>
        </View>
      ) : (
        <FlatList
          style={styles.queueList}
          data={entries}
          keyExtractor={(e) => e.piece.id}
          renderItem={({ item }) => (
            <QueueRow
              entry={item}
              onUpdateQuantity={(q) => updateQuantity(item.piece.id, q)}
              onRemove={() => removeEntry(item.piece.id)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

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
  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#666', textTransform: 'uppercase' },
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
  searchResults: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, overflow: 'hidden' },
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
  queueList: { flex: 1 },
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
