import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart, CartItem, effectivePrice } from '../context/CartContext';
import { useDeals } from '../context/DealsContext';
import { evaluateDeals } from '../lib/deals';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import { useScanToCart } from '../lib/scanToCart';
import HiddenScanCapture from '../components/HiddenScanCapture';
import CameraScanner from '../components/CameraScanner';
import AppModal from '../components/AppModal';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { thumbUrl } from '../lib/images';
import CheckoutScreen from './CheckoutScreen';
import { colors } from '../lib/theme';

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
  const { items, subtotal, addItem } = useCart();
  const { deals } = useDeals();
  const { requestAdmin } = useAppMode();
  const { store } = useAuth();
  const { addBySku, lookupSku } = useScanToCart();
  const { isTabletUp } = useBreakpoint();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const dealsResult = useMemo(() => evaluateDeals(items, deals), [items, deals]);
  const total = subtotal - dealsResult.totalDiscount;
  const hasPaymentMethods = (store?.enabled_payment_methods ?? []).length > 0;

  function handleWedgeScan(code: string) {
    const result = addBySku(code);
    setScanMessage({ text: result.message, ok: result.success });
  }

  if (checkoutOpen) {
    return <CheckoutScreen onClose={() => setCheckoutOpen(false)} initialStep="buyerTip" />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Same title-with-dropdown as the admin side (AdminScreen.tsx), so
          the way back into staff mode is in the same place in both views. */}
      <View style={styles.titleBar}>
        <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuButtonText}>{store?.name} ▾</Text>
        </Pressable>
      </View>

      <View style={[styles.content, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <View style={styles.header}>
          <Pressable style={styles.cameraButton} onPress={() => setCameraOpen(true)}>
            <Text style={styles.cameraButtonText}>Scan with camera</Text>
          </Pressable>
          {scanMessage && (
            <Text style={[styles.scanMessage, scanMessage.ok ? styles.scanMessageOk : styles.scanMessageError]}>
              {scanMessage.text}
            </Text>
          )}
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

      <AppModal visible={menuOpen} transparent onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <SafeAreaView edges={['top']} style={styles.menuWrap}>
            <View style={styles.menu}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  requestAdmin();
                }}
              >
                <Text style={styles.menuItemText}>Staff Access</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Pressable>
      </AppModal>

      <CameraScanner
        visible={cameraOpen}
        resolveCode={lookupSku}
        onAdd={(piece) => {
          addItem(piece);
          setScanMessage({ text: `Added ${piece.title}.`, ok: true });
        }}
        onClose={() => setCameraOpen(false)}
      />
      <HiddenScanCapture onScan={handleWedgeScan} enabled={!checkoutOpen && !cameraOpen} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  titleBar: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuButton: { paddingVertical: 4, paddingHorizontal: 8 },
  menuButtonText: { fontSize: 20, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  menuWrap: { alignItems: 'center' },
  menu: {
    marginTop: 8,
    width: 240,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 18 },
  menuItemText: { fontSize: 16, color: colors.ink },
  header: { paddingTop: 16, paddingBottom: 16, alignItems: 'center', gap: 10 },
  cameraButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cameraButtonText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  scanMessage: { fontSize: 13, fontWeight: '600' },
  scanMessageOk: { color: '#2a7a2a' },
  scanMessageError: { color: '#b00020' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#999', fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16 },
  thumb: { width: 56, height: 56, borderRadius: 8, marginRight: 16, backgroundColor: colors.chip },
  thumbPlaceholder: { width: 56, height: 56, borderRadius: 8, marginRight: 16, backgroundColor: colors.chip },
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
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmCartButtonTabletUp: { paddingVertical: 20 },
  confirmCartButtonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  confirmCartButtonTextTabletUp: { fontSize: 19 },
});
