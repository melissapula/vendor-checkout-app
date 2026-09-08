import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCart } from '../context/CartContext';
import { usePieces } from '../context/PiecesContext';
import { useSales } from '../context/SalesContext';
import { calculateFee } from '../lib/fees';
import { PaymentMethod, Sale } from '../types/database';

const METHODS: { key: PaymentMethod; label: string; enabled: boolean; tippable: boolean }[] = [
  { key: 'square', label: 'Square (card)', enabled: false, tippable: false },
  { key: 'venmo', label: 'Venmo', enabled: true, tippable: true },
  { key: 'paypal', label: 'PayPal', enabled: true, tippable: true },
  { key: 'cash', label: 'Cash', enabled: true, tippable: true },
];

export default function CheckoutScreen({ onClose }: { onClose: () => void }) {
  const { items, subtotal, clear } = useCart();
  const { sellUnits } = usePieces();
  const { addSales } = useSales();
  const [method, setMethod] = useState<PaymentMethod>('venmo');
  const [tipText, setTipText] = useState('');

  const selectedMethod = METHODS.find((m) => m.key === method)!;
  const tipAmount = selectedMethod.tippable ? parseFloat(tipText) || 0 : 0;
  const fee = useMemo(() => calculateFee(subtotal, method), [subtotal, method]);
  // Fee reduces Chrissy's net payout rather than being added to the buyer's
  // total — see "Decide: fee reduces payout vs. passed to buyer" in
  // chrissy-art-inventory-app.md. Revisit if that business decision changes.
  const buyerTotal = subtotal + tipAmount;
  const netRevenue = subtotal - fee;

  function handleConfirmPaid() {
    const newSales: Sale[] = [];

    items.forEach((item, itemIndex) => {
      const apportionedFee =
        subtotal > 0 ? Math.round(((item.piece.price / subtotal) * fee) * 100) / 100 : 0;
      const perUnitFee = Math.round((apportionedFee / item.quantity) * 100) / 100;

      for (let i = 0; i < item.quantity; i++) {
        newSales.push({
          id: `sale-${Date.now()}-${itemIndex}-${i}`,
          piece_id: item.piece.id,
          sale_price: item.piece.price,
          tip_amount: itemIndex === 0 && i === 0 ? tipAmount : null,
          payment_method: method,
          fee_amount: perUnitFee,
          sale_date: new Date().toISOString(),
          square_payment_id: null,
          location: null,
        });
      }
      sellUnits(item.piece.id, item.quantity);
    });

    addSales(newSales);
    clear();
    onClose();
    Alert.alert(
      'Sale recorded',
      `Charged $${buyerTotal.toFixed(2)} via ${selectedMethod.label}.\nNet after fees: $${netRevenue.toFixed(2)}`
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Checkout</Text>

        <Text style={styles.sectionLabel}>Payment method</Text>
        <View style={styles.methodRow}>
          {METHODS.map((m) => (
            <Pressable
              key={m.key}
              disabled={!m.enabled}
              onPress={() => setMethod(m.key)}
              style={[
                styles.methodButton,
                method === m.key && styles.methodButtonSelected,
                !m.enabled && styles.methodButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.methodButtonText,
                  method === m.key && styles.methodButtonTextSelected,
                ]}
              >
                {m.label}
                {!m.enabled ? ' (soon)' : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedMethod.tippable && (
          <>
            <Text style={styles.sectionLabel}>Tip (optional)</Text>
            <TextInput
              style={styles.tipInput}
              value={tipText}
              onChangeText={setTipText}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </>
        )}

        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={subtotal} />
          {tipAmount > 0 && <SummaryRow label="Tip" value={tipAmount} />}
          <SummaryRow label="Est. processing fee" value={-fee} muted />
          <SummaryRow label="Buyer pays" value={buyerTotal} bold />
          <SummaryRow label="Net to Chrissy" value={netRevenue} muted />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.confirmButton} onPress={handleConfirmPaid}>
          <Text style={styles.confirmButtonText}>Confirm Paid</Text>
        </Pressable>
        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, muted && styles.muted]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.bold, muted && styles.muted]}>
        {value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 16 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  sectionLabel: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  methodButtonSelected: { backgroundColor: '#1a1a1a' },
  methodButtonDisabled: { opacity: 0.4 },
  methodButtonText: { fontWeight: '600', color: '#1a1a1a' },
  methodButtonTextSelected: { color: '#fff' },
  tipInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  summary: { marginTop: 24, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 15, color: '#333' },
  summaryValue: { fontSize: 15, color: '#333' },
  bold: { fontWeight: '700', fontSize: 17 },
  muted: { color: '#888' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  confirmButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel: { textAlign: 'center', color: '#666' },
});
