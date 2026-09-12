import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppModal from './AppModal';
import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';
import { appAlert } from '../lib/alert';
import { Piece } from '../types/database';

// Same "always browsable, cap the list" convention as
// PrintLabelsBuilderScreen's item picker.
const MAX_RESULTS_UNFILTERED = 50;
const MAX_RESULTS_FILTERED = 20;

type Mode = 'picker' | 'custom';

export default function AddItemModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { pieces, addPiece } = usePieces();
  const { items, addItem } = useCart();
  const [mode, setMode] = useState<Mode>('picker');
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customCost, setCustomCost] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setMode('picker');
    setSearch('');
    setCustomName('');
    setCustomCost('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sellable = pieces.filter(isSellable);
    const matches = q
      ? sellable.filter((p) => p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : sellable;
    const sorted = [...matches].sort((a, b) => a.title.localeCompare(b.title));
    return sorted.slice(0, q ? MAX_RESULTS_FILTERED : MAX_RESULTS_UNFILTERED);
  }, [pieces, search]);

  function handlePick(piece: Piece) {
    const existing = items.find((i) => i.piece.id === piece.id);
    if (existing && existing.quantity >= piece.quantity_remaining) {
      appAlert('Out of stock', `Only ${piece.quantity_remaining} of ${piece.title} in stock — already at max in cart.`);
      return;
    }
    addItem(piece);
    handleClose();
  }

  async function handleAddCustom() {
    if (!customName.trim()) return appAlert('Missing name', 'Give this item a name.');
    const cost = parseFloat(customCost);
    if (isNaN(cost) || cost < 0) return appAlert('Invalid price', 'Enter a price of $0 or more.');

    setSubmitting(true);
    try {
      const piece = await addPiece({
        sku: `CUSTOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: customName.trim(),
        medium: null,
        width_in: null,
        height_in: null,
        series: null,
        size: null,
        price: cost,
        cost_basis: null,
        status: 'available',
        type: 'custom',
        original_id: null,
        print_run_size: null,
        quantity_remaining: 1,
        date_sold: null,
        sale_channel: null,
        notes: null,
        image_url: null,
        info_url: null,
      });
      addItem(piece);
      handleClose();
    } catch (err) {
      appAlert('Add failed', err instanceof Error ? err.message : 'Could not add this item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal visible={visible} onRequestClose={handleClose}>
      <SafeAreaView style={styles.container}>
        {mode === 'picker' ? (
          <>
            <View style={styles.header}>
              <Text style={styles.heading}>Add Item to Cart</Text>
              <Pressable onPress={handleClose} hitSlop={10}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search inventory by title or SKU…"
              autoFocus
            />
            <FlatList
              style={styles.list}
              data={results}
              keyExtractor={(p) => p.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <Pressable style={styles.customRow} onPress={() => setMode('custom')}>
                  <Text style={styles.customRowText}>+ Add custom item</Text>
                </Pressable>
              }
              renderItem={({ item }) => (
                <Pressable style={styles.row} onPress={() => handlePick(item)}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowMeta}>
                      {item.sku} · {item.quantity_remaining} left
                    </Text>
                  </View>
                  <Text style={styles.rowPrice}>${item.price.toFixed(2)}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                search.trim() ? <Text style={styles.empty}>No matching items.</Text> : null
              }
            />
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Pressable onPress={() => setMode('picker')} hitSlop={10}>
                <Text style={styles.backText}>‹ Back</Text>
              </Pressable>
              <Text style={styles.heading}>Add Custom Item</Text>
              <Pressable onPress={handleClose} hitSlop={10}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.form}>
              <Text style={styles.label}>Item name</Text>
              <TextInput
                style={styles.input}
                value={customName}
                onChangeText={setCustomName}
                placeholder="e.g. Custom commission deposit"
                autoFocus
                onSubmitEditing={handleAddCustom}
              />
              <Text style={styles.label}>Cost ($)</Text>
              <TextInput
                style={styles.input}
                value={customCost}
                onChangeText={setCustomCost}
                keyboardType="decimal-pad"
                placeholder="e.g. 25"
                onSubmitEditing={handleAddCustom}
              />
              <Pressable
                style={[styles.addButton, submitting && styles.disabled]}
                disabled={submitting}
                onPress={handleAddCustom}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>Add to Cart</Text>}
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  heading: { fontSize: 17, fontWeight: '700' },
  closeText: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
  backText: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  searchInput: {
    margin: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  list: { flex: 1 },
  customRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderStyle: 'dashed',
  },
  customRowText: { fontWeight: '700', color: '#1a1a1a', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  rowPrice: { fontSize: 15, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', padding: 24 },
  form: { padding: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  disabled: { opacity: 0.6 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
