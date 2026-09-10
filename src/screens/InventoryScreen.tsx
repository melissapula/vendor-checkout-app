import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Piece } from '../types/database';
import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';
import PieceFormScreen from './PieceFormScreen';
import PrintLabelsOverlay from '../components/PrintLabelsOverlay';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { thumbUrl } from '../lib/images';

function statusLabel(piece: Piece): string {
  if (piece.status === 'sold') return 'Sold';
  if (piece.status === 'reserved') return 'Reserved';
  if (piece.quantity_remaining === 0) return 'Out of stock';
  return `${piece.quantity_remaining} left`;
}

function PieceRow({
  piece,
  onEdit,
  onAddVariant,
  onPrintLabel,
  onAdded,
}: {
  piece: Piece;
  onEdit: () => void;
  onAddVariant: () => void;
  onPrintLabel: () => void;
  onAdded: (piece: Piece) => void;
}) {
  const { addItem } = useCart();
  const sellable = isSellable(piece);

  return (
    <View style={styles.row}>
      {piece.image_url ? (
        <Image source={{ uri: thumbUrl(piece.image_url) }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.title}>{piece.title}</Text>
        <Text style={styles.meta}>
          {piece.sku} · {piece.medium ?? piece.type}
        </Text>
        <Text style={[styles.status, !sellable && styles.statusUnavailable]}>
          {statusLabel(piece)}
        </Text>
        {piece.type === 'original' && (
          <Pressable onPress={onAddVariant}>
            <Text style={styles.variantLink}>+ Add variant</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.rowActions}>
        <Text style={styles.price}>${piece.price.toFixed(2)}</Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.editButton} onPress={onEdit}>
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.addButton, !sellable && styles.addButtonDisabled]}
            disabled={!sellable}
            onPress={() => {
              addItem(piece);
              onAdded(piece);
            }}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
        <Pressable onPress={onPrintLabel}>
          <Text style={styles.labelLink}>Print label</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const { pieces, loading, error } = usePieces();
  const [editingPiece, setEditingPiece] = useState<Piece | null>(null);
  const [presetOriginalId, setPresetOriginalId] = useState<string | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [printQueue, setPrintQueue] = useState<Piece[] | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const { isTabletUp } = useBreakpoint();

  useEffect(() => {
    if (!addedMessage) return;
    const timer = setTimeout(() => setAddedMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [addedMessage]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load inventory: {error}</Text>
      </View>
    );
  }

  function openEdit(piece: Piece) {
    setEditingPiece(piece);
    setPresetOriginalId(undefined);
    setFormOpen(true);
  }

  function openAddVariant(originalId: string) {
    setEditingPiece(null);
    setPresetOriginalId(originalId);
    setFormOpen(true);
  }

  function openAddNew() {
    setEditingPiece(null);
    setPresetOriginalId(undefined);
    setFormOpen(true);
  }

  function printAllLabels() {
    // Skip sold pieces — no need to re-tag something that's already gone.
    setPrintQueue(pieces.filter((p) => p.status !== 'sold'));
  }

  return (
    <>
      {addedMessage && (
        <View style={styles.addedBanner}>
          <Text style={styles.addedBannerText}>✓ {addedMessage}</Text>
        </View>
      )}
      <FlatList
        style={styles.list}
        contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}
        data={pieces}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PieceRow
            piece={item}
            onEdit={() => openEdit(item)}
            onAddVariant={() => openAddVariant(item.id)}
            onPrintLabel={() => setPrintQueue([item])}
            onAdded={(piece) => setAddedMessage(`Added "${piece.title}" to the customer's cart`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <Pressable style={styles.printAllButton} onPress={printAllLabels}>
          <Text style={styles.printAllButtonText}>Print Labels</Text>
        </Pressable>
        <Pressable style={styles.addPieceButton} onPress={openAddNew}>
          <Text style={styles.addPieceButtonText}>+ Add Piece</Text>
        </Pressable>
      </View>
      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <PieceFormScreen
          piece={editingPiece ?? undefined}
          presetOriginalId={presetOriginalId}
          onClose={() => setFormOpen(false)}
        />
      </Modal>
      <PrintLabelsOverlay pieces={printQueue} onDone={() => setPrintQueue(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  addedBanner: { backgroundColor: '#e8f5e8', paddingHorizontal: 16, paddingVertical: 10 },
  addedBannerText: { color: '#2a7a2a', fontWeight: '600', fontSize: 13 },
  errorText: { color: '#b00020', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  thumb: { width: 48, height: 48, borderRadius: 6, marginRight: 12, backgroundColor: '#f0f0f0' },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  rowInfo: { flex: 1, marginRight: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  status: { fontSize: 13, color: '#2a7a2a', marginTop: 4 },
  statusUnavailable: { color: '#999' },
  variantLink: { fontSize: 12, color: '#1a1a1a', marginTop: 4, fontWeight: '600' },
  rowActions: { alignItems: 'flex-end' },
  price: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  editButtonText: { color: '#1a1a1a', fontWeight: '600' },
  addButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonDisabled: { backgroundColor: '#ddd' },
  addButtonText: { color: '#fff', fontWeight: '600' },
  labelLink: { fontSize: 12, color: '#666', marginTop: 8, textDecorationLine: 'underline' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  footer: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  addPieceButton: { flex: 1, backgroundColor: '#1a1a1a', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  addPieceButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  printAllButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  printAllButtonText: { color: '#1a1a1a', fontWeight: '700', fontSize: 16 },
});
