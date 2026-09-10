import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart, CartItem, effectivePrice } from '../context/CartContext';
import { useDeals } from '../context/DealsContext';
import { evaluateDeals } from '../lib/deals';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { thumbUrl } from '../lib/images';
import CheckoutScreen from './CheckoutScreen';

function CustomerRow({ item }: { item: CartItem }) {
  const price = effectivePrice(item);
  const lineTotal = price * item.quantity;
  return (
    <View style={styles.row}>
      {item.piece.image_url ? (
        <Image source={{ uri: thumbUrl(item.piece.image_url) }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.title}>{item.piece.title}</Text>
        <Text style={styles.meta}>
          {item.quantity} × ${price.toFixed(2)}
        </Text>
      </View>
      <Text style={styles.lineTotal}>${lineTotal.toFixed(2)}</Text>
    </View>
  );
}

export default function CustomerScreen() {
  const { items, subtotal } = useCart();
  const { deals } = useDeals();
  const { requestAdmin } = useAppMode();
  const { store } = useAuth();
  const { isTabletUp } = useBreakpoint();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const dealsResult = useMemo(() => evaluateDeals(items, deals), [items, deals]);
  const total = subtotal - dealsResult.totalDiscount;
  const hasPaymentMethods = (store?.enabled_payment_methods ?? []).length > 0;

  if (checkoutOpen) {
    return <CheckoutScreen onClose={() => setCheckoutOpen(false)} initialStep="buyerTip" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.content, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{store?.name}</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Your cart will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.piece.id}
            renderItem={({ item }) => <CustomerRow item={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        {items.length > 0 && (
          <View style={styles.footer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
            </View>
            {dealsResult.applied.map((a) => (
              <View key={a.deal.id} style={styles.summaryRow}>
                <Text style={styles.dealLabel}>{a.deal.name}</Text>
                <Text style={styles.dealValue}>-${a.discountAmount.toFixed(2)}</Text>
              </View>
            ))}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
            {hasPaymentMethods && (
              <Pressable
                style={[styles.confirmCartButton, isTabletUp && styles.confirmCartButtonTabletUp]}
                onPress={() => setCheckoutOpen(true)}
              >
                <Text style={[styles.confirmCartButtonText, isTabletUp && styles.confirmCartButtonTextTabletUp]}>
                  Confirm Cart
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <Pressable style={styles.staffButton} onPress={requestAdmin} hitSlop={12}>
        <Text style={styles.staffButtonText}>Staff Access</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  header: { paddingTop: 20, paddingBottom: 20, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#999', fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 },
  thumb: { width: 56, height: 56, borderRadius: 8, marginRight: 16, backgroundColor: '#f0f0f0' },
  thumbPlaceholder: { width: 56, height: 56, borderRadius: 8, marginRight: 16, backgroundColor: '#f0f0f0' },
  rowInfo: { flex: 1, marginRight: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  meta: { fontSize: 14, color: '#666', marginTop: 4 },
  lineTotal: { fontSize: 18, fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 24 },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: '#eee', gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 16, color: '#333' },
  summaryValue: { fontSize: 16, color: '#333' },
  dealLabel: { fontSize: 14, color: '#2a7a2a' },
  dealValue: { fontSize: 14, color: '#2a7a2a', fontWeight: '600' },
  totalRow: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  totalLabel: { fontSize: 20, fontWeight: '700' },
  totalValue: { fontSize: 20, fontWeight: '700' },
  confirmCartButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmCartButtonTabletUp: { paddingVertical: 20 },
  confirmCartButtonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  confirmCartButtonTextTabletUp: { fontSize: 19 },
  staffButton: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  staffButtonText: { color: '#999', fontSize: 13, fontWeight: '500' },
});
