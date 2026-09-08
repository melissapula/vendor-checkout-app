import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Piece } from '../types/database';
import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';

function statusLabel(piece: Piece): string {
  if (piece.status === 'sold') return 'Sold';
  if (piece.status === 'reserved') return 'Reserved';
  if (piece.quantity_remaining === 0) return 'Out of stock';
  return `${piece.quantity_remaining} left`;
}

function PieceRow({ piece }: { piece: Piece }) {
  const { addItem } = useCart();
  const sellable = isSellable(piece);

  return (
    <View style={styles.row}>
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
        <Pressable
          style={[styles.addButton, !sellable && styles.addButtonDisabled]}
          disabled={!sellable}
          onPress={() => addItem(piece)}
        >
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const { pieces } = usePieces();

  return (
    <FlatList
      style={styles.list}
      data={pieces}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <PieceRow piece={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#fff' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  status: { fontSize: 13, color: '#2a7a2a', marginTop: 4 },
  statusUnavailable: { color: '#999' },
  rowActions: { alignItems: 'flex-end' },
  price: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
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
