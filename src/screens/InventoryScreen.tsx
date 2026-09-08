import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Piece } from '../types/database';
import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';
import EditPieceScreen from './EditPieceScreen';

function statusLabel(piece: Piece): string {
  if (piece.status === 'sold') return 'Sold';
  if (piece.status === 'reserved') return 'Reserved';
  if (piece.quantity_remaining === 0) return 'Out of stock';
  return `${piece.quantity_remaining} left`;
}

// Sanity's CDN accepts on-the-fly resize params, so the list requests a
// small thumbnail instead of the full-resolution site image.
function thumbUrl(url: string): string {
  return `${url}?w=112&h=112&fit=crop&auto=format`;
}

function PieceRow({ piece, onEdit }: { piece: Piece; onEdit: () => void }) {
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
            onPress={() => addItem(piece)}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const { pieces, loading, error } = usePieces();
  const [editingPiece, setEditingPiece] = useState<Piece | null>(null);

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

  return (
    <>
      <FlatList
        style={styles.list}
        data={pieces}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PieceRow piece={item} onEdit={() => setEditingPiece(item)} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <Modal visible={!!editingPiece} animationType="slide" onRequestClose={() => setEditingPiece(null)}>
        {editingPiece && (
          <EditPieceScreen piece={editingPiece} onClose={() => setEditingPiece(null)} />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
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
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
});
