import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { usePieces } from '../context/PiecesContext';
import { useSales } from '../context/SalesContext';
import { appAlert } from '../lib/alert';
import { exportInventoryCsv, exportSalesCsv } from '../lib/dataExport';
import PaymentSettingsScreen from './PaymentSettingsScreen';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';

export default function StoreSettingsScreen() {
  const { store, updateStore, signOut } = useAuth();
  const { pieces } = usePieces();
  const { sales } = useSales();
  const [name, setName] = useState(store?.name ?? '');
  const [pin, setPin] = useState(store?.admin_pin ?? '');
  const [requirePin, setRequirePin] = useState(store?.require_admin_pin ?? true);
  const [lowStockThreshold, setLowStockThreshold] = useState(
    store?.low_stock_threshold != null ? String(store.low_stock_threshold) : '3'
  );
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'main' | 'payments'>('main');
  const { isTabletUp } = useBreakpoint();

  if (view === 'payments') {
    return (
      <View style={{ flex: 1 }}>
        <Pressable style={[styles.backRow, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]} onPress={() => setView('main')}>
          <Text style={styles.backLink}>← Back to Settings</Text>
        </Pressable>
        <PaymentSettingsScreen />
      </View>
    );
  }

  async function handleSave() {
    if (!name.trim()) return appAlert('Missing name', 'Give your store a name.');
    if (!/^\d{4,6}$/.test(pin)) return appAlert('Invalid PIN', 'Pick a 4–6 digit staff PIN.');
    const threshold = parseInt(lowStockThreshold, 10);
    if (isNaN(threshold) || threshold < 0) {
      return appAlert('Invalid threshold', 'Enter a low-stock threshold of 0 or more.');
    }

    setSubmitting(true);
    try {
      await updateStore({
        name: name.trim(),
        admin_pin: pin,
        require_admin_pin: requirePin,
        low_stock_threshold: threshold,
      });
      appAlert('Saved', 'Store settings updated.');
    } catch (err) {
      appAlert('Save failed', err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
      <Text style={styles.heading}>Store Settings</Text>

      <Text style={styles.label}>Store name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your store name"
        onSubmitEditing={handleSave}
      />

      <Text style={styles.label}>Staff PIN</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="4–6 digit PIN"
        keyboardType="number-pad"
        onSubmitEditing={handleSave}
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Require PIN for staff access</Text>
        <Switch value={requirePin} onValueChange={setRequirePin} />
      </View>
      {!requirePin && (
        <Text style={styles.hint}>
          "Staff Access" will skip the PIN prompt and go straight to the admin view — anyone using
          this device can get in.
        </Text>
      )}

      <Text style={styles.label}>Low stock threshold</Text>
      <TextInput
        style={styles.input}
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
        placeholder="3"
        keyboardType="number-pad"
        onSubmitEditing={handleSave}
      />
      <Text style={styles.helper}>
        Inventory flags a print/sticker/etc. as "Low stock" once it's at or under this many units left
        (originals aren't flagged — there's only ever one).
      </Text>

      <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
      </Pressable>

      <View style={styles.divider} />

      <Pressable style={styles.paymentSettingsRow} onPress={() => setView('payments')}>
        <Text style={styles.paymentSettingsText}>Payment Methods →</Text>
      </Pressable>

      <View style={styles.divider} />

      <Text style={styles.label}>Export data</Text>
      <Text style={styles.helper}>Download a CSV for your own records, accountant, or insurance.</Text>
      <View style={styles.exportRow}>
        <Pressable style={styles.exportButton} onPress={() => exportInventoryCsv(pieces)}>
          <Text style={styles.exportButtonText}>Export Inventory</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={() => exportSalesCsv(sales, pieces)}>
          <Text style={styles.exportButtonText}>Export Sales</Text>
        </Pressable>
      </View>

      <View style={styles.divider} />

      <Pressable disabled={submitting} onPress={signOut}>
        <Text style={styles.signOut}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  hint: { fontSize: 12, color: '#b00020', marginTop: 6 },
  helper: { fontSize: 12, color: '#888', marginTop: 6 },
  exportRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  exportButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  exportButtonText: { color: '#1a1a1a', fontWeight: '700', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 24 },
  signOut: { textAlign: 'center', color: '#b00020', fontWeight: '600' },
  paymentSettingsRow: { paddingVertical: 4 },
  paymentSettingsText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  backRow: { padding: 16, paddingBottom: 0 },
  backLink: { color: '#666', fontSize: 14 },
});
