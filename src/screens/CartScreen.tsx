import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppModal from '../components/AppModal';
import { CartItem, effectivePrice, useCart } from '../context/CartContext';
import { useDeals } from '../context/DealsContext';
import { evaluateDeals } from '../lib/deals';
import { useScanToCart } from '../lib/scanToCart';
import CameraScanner from '../components/CameraScanner';
import CheckoutScreen from './CheckoutScreen';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { thumbUrl } from '../lib/images';

function CartRow({ item }: { item: CartItem }) {
  const { updateQuantity, removeItem, setItemPrice } = useCart();
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceText, setPriceText] = useState('');
  const price = effectivePrice(item);
  const lineTotal = price * item.quantity;
  const isOverridden = item.overridePrice != null;

  function startEditingPrice() {
    setPriceText(price.toFixed(2));
    setEditingPrice(true);
  }

  function savePrice() {
    const value = parseFloat(priceText);
    setItemPrice(item.piece.id, isNaN(value) || value < 0 ? null : value);
    setEditingPrice(false);
  }

  function resetPrice() {
    setItemPrice(item.piece.id, null);
    setEditingPrice(false);
  }

  return (
    <View style={styles.row}>
      {item.piece.image_url ? (
        <Image source={{ uri: thumbUrl(item.piece.image_url) }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbPlaceholder} />
      )}
      <View style={styles.rowInfo}>
        <Text style={styles.title}>{item.piece.title}</Text>
        {editingPrice ? (
          <View style={styles.priceEditRow}>
            <Text style={styles.priceEditDollar}>$</Text>
            <TextInput
              style={styles.priceEditInput}
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="decimal-pad"
              autoFocus
              onSubmitEditing={savePrice}
            />
            <Pressable onPress={savePrice}>
              <Text style={styles.priceEditSave}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setEditingPrice(false)}>
              <Text style={styles.priceEditCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.priceRow}>
            {isOverridden && <Text style={styles.priceOriginal}>${item.piece.price.toFixed(2)}</Text>}
            <Text style={styles.meta}>${price.toFixed(2)} each</Text>
            <Pressable onPress={startEditingPrice}>
              <Text style={styles.editPriceLink}>Adjust price</Text>
            </Pressable>
            {isOverridden && (
              <Pressable onPress={resetPrice}>
                <Text style={styles.editPriceLink}>Reset</Text>
              </Pressable>
            )}
          </View>
        )}
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
  const { items, subtotal, clear, addItem } = useCart();
  const { deals } = useDeals();
  const { addBySku, lookupSku } = useScanToCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [skuInput, setSkuInput] = useState('');
  const [scanMessage, setScanMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const { isTabletUp } = useBreakpoint();

  const dealsResult = useMemo(() => evaluateDeals(items, deals), [items, deals]);
  const total = subtotal - dealsResult.totalDiscount;

  function handleSkuSubmit() {
    if (!skuInput.trim()) return;
    const result = addBySku(skuInput);
    setScanMessage({ text: result.message, ok: result.success });
    setSkuInput('');
  }

  return (
    <View style={styles.container}>
      <View style={[styles.content, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <View style={styles.scanBar}>
          <TextInput
            style={styles.scanInput}
            value={skuInput}
            onChangeText={setSkuInput}
            onSubmitEditing={handleSkuSubmit}
            placeholder="Scan or type a SKU, then Enter"
            autoCapitalize="characters"
            returnKeyType="done"
          />
          <Pressable style={styles.cameraButton} onPress={() => setCameraOpen(true)}>
            <Text style={styles.cameraButtonText}>Scan with camera</Text>
          </Pressable>
        </View>
        {scanMessage && (
          <Text style={[styles.scanMessage, scanMessage.ok ? styles.scanMessageOk : styles.scanMessageError]}>
            {scanMessage.text}
          </Text>
        )}

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Cart is empty — scan a barcode or add pieces from Inventory.</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={items}
              keyExtractor={(i) => i.piece.id}
              renderItem={({ item }) => <CartRow item={item} />}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListFooterComponent={
                dealsResult.applied.length + dealsResult.overridden.length > 0 ? (
                  <View style={styles.deals}>
                    {dealsResult.applied.map((a) => (
                      <Text key={a.deal.id} style={styles.dealApplied}>
                        ✓ {a.description}
                      </Text>
                    ))}
                    {dealsResult.overridden.map((o) => (
                      <Text key={o.deal.id} style={styles.dealOverridden}>
                        {o.deal.name} (better deal already applied)
                      </Text>
                    ))}
                  </View>
                ) : null
              }
            />
            <View style={styles.footer}>
              <View style={styles.subtotalRow}>
                <Text style={styles.subtotalLabel}>Subtotal</Text>
                <Text style={styles.subtotalValue}>${subtotal.toFixed(2)}</Text>
              </View>
              {dealsResult.totalDiscount > 0 && (
                <View style={styles.subtotalRow}>
                  <Text style={styles.discountLabel}>Deals</Text>
                  <Text style={styles.discountValue}>-${dealsResult.totalDiscount.toFixed(2)}</Text>
                </View>
              )}
              {dealsResult.totalDiscount > 0 && (
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>Total</Text>
                  <Text style={styles.subtotalValue}>${total.toFixed(2)}</Text>
                </View>
              )}
              <Pressable style={styles.checkoutButton} onPress={() => setCheckoutOpen(true)}>
                <Text style={styles.checkoutButtonText}>Checkout</Text>
              </Pressable>
              <Pressable onPress={clear}>
                <Text style={styles.clear}>Clear cart</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <AppModal visible={checkoutOpen} onRequestClose={() => setCheckoutOpen(false)}>
        <CheckoutScreen onClose={() => setCheckoutOpen(false)} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#666', fontSize: 15, textAlign: 'center' },
  scanBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  scanInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  cameraButton: {
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  cameraButtonText: { color: '#1a1a1a', fontWeight: '600', fontSize: 13 },
  scanMessage: { paddingHorizontal: 16, paddingTop: 8, fontSize: 13, fontWeight: '600' },
  scanMessageOk: { color: '#2a7a2a' },
  scanMessageError: { color: '#b00020' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  thumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#f0f0f0' },
  thumbPlaceholder: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#f0f0f0' },
  rowInfo: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: '#666', marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  priceOriginal: { fontSize: 12, color: '#999', textDecorationLine: 'line-through' },
  editPriceLink: { fontSize: 11, color: '#1a1a1a', textDecorationLine: 'underline' },
  priceEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  priceEditDollar: { fontSize: 14, color: '#666' },
  priceEditInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    width: 70,
  },
  priceEditSave: { fontSize: 12, color: '#1a1a1a', fontWeight: '700' },
  priceEditCancel: { fontSize: 12, color: '#666' },
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
  discountLabel: { fontSize: 15, color: '#2a7a2a' },
  discountValue: { fontSize: 15, color: '#2a7a2a', fontWeight: '600' },
  deals: { paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  dealApplied: { color: '#2a7a2a', fontSize: 13, fontWeight: '600' },
  dealOverridden: { color: '#999', fontSize: 13, textDecorationLine: 'line-through' },
  checkoutButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  checkoutButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  clear: { textAlign: 'center', color: '#666' },
});
