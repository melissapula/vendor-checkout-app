import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CartItem, useCart } from '../context/CartContext';
import CheckoutScreen from './CheckoutScreen';

function CartRow({ item }: { item: CartItem }) {
  const { updateQuantity, removeItem } = useCart();
  const lineTotal = item.piece.price * item.quantity;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.title}>{item.piece.title}</Text>
        <Text style={styles.meta}>${item.piece.price.toFixed(2)} each</Text>
      </View>
      <View style={styles.qtyControls}>
        <Pressable
          style={styles.qtyButton}
          onPress={() => updateQuantity(item.piece.id, item.quantity - 1)}
        >
          <Text style={styles.qtyButtonText}>−</Text>
        </Pressable>
        <Text style={styles.qty}>{item.quantity}</Text>
        <Pressable
          style={styles.qtyButton}
          onPress={() => updateQuantity(item.piece.id, item.quantity + 1)}
        >
          <Text style={styles.qtyButtonText}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.lineTotal}>${lineTotal.toFixed(2)}</Text>
      <Pressable onPress={() => removeItem(item.piece.id)}>
        <Text style={styles.remove}>Remove</Text>
      </Pressable>
    </View>
  );
}

export default function CartScreen() {
  const { items, subtotal, clear } = useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Cart is empty — add pieces from Inventory.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.piece.id}
        renderItem={({ item }) => <CartRow item={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <View style={styles.footer}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
        </View>
        <Pressable style={styles.checkoutButton} onPress={() => setCheckoutOpen(true)}>
          <Text style={styles.checkoutButtonText}>Checkout</Text>
        </Pressable>
        <Pressable onPress={clear}>
          <Text style={styles.clear}>Clear cart</Text>
        </Pressable>
      </View>

      <Modal visible={checkoutOpen} animationType="slide" onRequestClose={() => setCheckoutOpen(false)}>
        <CheckoutScreen onClose={() => setCheckoutOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#666', fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  rowInfo: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
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
  qty: { minWidth: 20, textAlign: 'center', fontWeight: '600' },
  lineTotal: { fontWeight: '600', minWidth: 60, textAlign: 'right' },
  remove: { color: '#b00020', fontSize: 12 },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 16,
    gap: 10,
  },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subtotalLabel: { fontSize: 16, color: '#333' },
  subtotalValue: { fontSize: 18, fontWeight: '700' },
  checkoutButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  clear: { textAlign: 'center', color: '#666' },
});
