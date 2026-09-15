import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Piece } from '../types/database';
import { usePieces, isSellable } from '../context/PiecesContext';
import { useCart } from '../context/CartContext';
import PieceFormScreen from './PieceFormScreen';
import LogAdjustmentScreen from './LogAdjustmentScreen';
import AppModal from '../components/AppModal';
import PrintLabelsOverlay, { LabelFields } from '../components/PrintLabelsOverlay';
import PrintLabelsBuilderScreen, { printQueueStorageKey, QueueEntry } from './PrintLabelsBuilderScreen';
import ImportPrintOrderScreen from './ImportPrintOrderScreen';
import { LabelSizeKey, labelSizeFor } from '../lib/labelSizes';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { thumbUrl } from '../lib/images';
import HiddenScanCapture from '../components/HiddenScanCapture';
import { appAlert } from '../lib/alert';
import { useAuth } from '../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

function statusLabel(piece: Piece): string {
  if (piece.status === 'sold') return 'Sold';
  if (piece.status === 'reserved') return 'Reserved';
  if (piece.quantity_remaining === 0) return 'Out of stock';
  return `${piece.quantity_remaining} left`;
}

// Originals are never "low stock" — there's exactly one of each, so a
// threshold-based warning would just fire on every original all the time
// and mean nothing (nothing to reorder).
function isLowStock(piece: Piece, threshold: number): boolean {
  return (
    piece.type !== 'original' &&
    piece.status === 'available' &&
    piece.quantity_remaining > 0 &&
    piece.quantity_remaining <= threshold
  );
}

function PieceRow({
  piece,
  lowStockThreshold,
  onEdit,
  onAddVariant,
  onPrintLabel,
  onLogAdjustment,
  justAdded,
  onAdded,
}: {
  piece: Piece;
  lowStockThreshold: number;
  onEdit: () => void;
  onAddVariant: () => void;
  onPrintLabel: () => void;
  onLogAdjustment: () => void;
  justAdded: boolean;
  onAdded: () => void;
}) {
  const { addItem } = useCart();
  const sellable = isSellable(piece);
  const lowStock = isLowStock(piece, lowStockThreshold);

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
        {lowStock && <Text style={styles.lowStockBadge}>Low stock — reorder soon</Text>}
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
          <View style={styles.addButtonWrap}>
            {justAdded && (
              <View style={styles.addedBadge} pointerEvents="none">
                <Text style={styles.addedBadgeText}>✓ Added to cart</Text>
              </View>
            )}
            <Pressable
              style={[styles.addButton, !sellable && styles.addButtonDisabled]}
              disabled={!sellable}
              onPress={() => {
                addItem(piece);
                onAdded();
              }}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>
        <Pressable onPress={onPrintLabel}>
          <Text style={styles.labelLink}>Print label</Text>
        </Pressable>
        {piece.quantity_remaining > 0 && (
          <Pressable onPress={onLogAdjustment}>
            <Text style={styles.labelLink}>Log loss/donation</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function InventoryScreen() {
  const { pieces, loading, error } = usePieces();
  const { store } = useAuth();
  const [editingPiece, setEditingPiece] = useState<Piece | null>(null);
  const [presetOriginalId, setPresetOriginalId] = useState<string | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitialPiece, setBuilderInitialPiece] = useState<Piece | undefined>(undefined);
  const [builderInitialEntries, setBuilderInitialEntries] = useState<QueueEntry[] | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [printJob, setPrintJob] = useState<{ pieces: Piece[]; fields: LabelFields; sizeKey: LabelSizeKey } | null>(
    null
  );
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [adjustingPiece, setAdjustingPiece] = useState<Piece | null>(null);
  const { isTabletUp } = useBreakpoint();

  useEffect(() => {
    if (!justAddedId) return;
    const timer = setTimeout(() => setJustAddedId(null), 2500);
    return () => clearTimeout(timer);
  }, [justAddedId]);

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

  function openBuilder(piece?: Piece) {
    setBuilderInitialPiece(piece);
    setBuilderInitialEntries(undefined);
    setBuilderOpen(true);
  }

  // After Import Print Order finishes writing to inventory, ask before
  // jumping into printing — restocking without wanting new labels right
  // that moment (e.g. importing at night, printing at the studio tomorrow)
  // is a completely normal thing to want.
  function handleImported(entries: QueueEntry[]) {
    setImportOpen(false);
    if (entries.length === 0) return;
    const totalLabels = entries.reduce((sum, e) => sum + e.quantity, 0);
    appAlert(
      'Inventory updated',
      `Added ${totalLabels} unit${totalLabels === 1 ? '' : 's'} across ${entries.length} piece${entries.length === 1 ? '' : 's'}. Print labels for these now?`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Print Labels',
          onPress: () => {
            setBuilderInitialPiece(undefined);
            setBuilderInitialEntries(entries);
            setBuilderOpen(true);
          },
        },
      ]
    );
  }

  // Scanning a piece's own label here is a quick way to pull up its edit
  // form (e.g. to adjust stock or price) without hunting for it in a long
  // list — a different action than Cart/CustomerScreen's "add to cart"
  // scan, matching what this screen is actually for.
  function handleWedgeScan(code: string) {
    const piece = pieces.find((p) => p.sku.toLowerCase() === code.trim().toLowerCase());
    if (!piece) {
      appAlert('Not found', `No item found for SKU "${code}".`);
      return;
    }
    openEdit(piece);
  }

  const scanCaptureEnabled = !formOpen && !builderOpen && !adjustingPiece;

  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}
        data={pieces}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PieceRow
            piece={item}
            lowStockThreshold={store?.low_stock_threshold ?? 3}
            onEdit={() => openEdit(item)}
            onAddVariant={() => openAddVariant(item.id)}
            onPrintLabel={() => openBuilder(item)}
            onLogAdjustment={() => setAdjustingPiece(item)}
            justAdded={item.id === justAddedId}
            onAdded={() => setJustAddedId(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No pieces yet — tap "+ Add Piece" to create one.</Text>
        }
      />
      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <Pressable style={styles.importButton} onPress={() => setImportOpen(true)}>
          <Text style={styles.importButtonText}>Import Print Order</Text>
        </Pressable>
        <View style={styles.footerRow}>
          <Pressable style={styles.printAllButton} onPress={() => openBuilder()}>
            <Text style={styles.printAllButtonText}>Print Labels</Text>
          </Pressable>
          <Pressable style={styles.addPieceButton} onPress={openAddNew}>
            <Text style={styles.addPieceButtonText}>+ Add Piece</Text>
          </Pressable>
        </View>
      </View>
      <AppModal visible={formOpen} onRequestClose={() => setFormOpen(false)}>
        <PieceFormScreen
          piece={editingPiece ?? undefined}
          presetOriginalId={presetOriginalId}
          onClose={() => setFormOpen(false)}
        />
      </AppModal>
      <AppModal visible={importOpen} onRequestClose={() => setImportOpen(false)}>
        <ImportPrintOrderScreen onClose={() => setImportOpen(false)} onImported={handleImported} />
      </AppModal>
      <AppModal visible={builderOpen} onRequestClose={() => setBuilderOpen(false)}>
        <PrintLabelsBuilderScreen
          initialPiece={builderInitialPiece}
          initialEntries={builderInitialEntries}
          onClose={() => setBuilderOpen(false)}
          onPrint={(pieces, fields, sizeKey) => {
            setPrintJob({ pieces, fields, sizeKey });
            setBuilderOpen(false);
          }}
        />
      </AppModal>
      <PrintLabelsOverlay
        pieces={printJob?.pieces ?? null}
        fields={printJob?.fields ?? null}
        size={printJob ? labelSizeFor(printJob.sizeKey) : null}
        onDone={() => {
          setPrintJob(null);
          // Only clear the persisted queue once printing has genuinely
          // finished (this fires from the browser's real afterprint event,
          // whether the vendor actually printed or backed out of the OS
          // dialog) — not when the builder merely hands off to this
          // overlay, since a page reload mid-flight (see
          // PrintLabelsBuilderScreen's note on why iOS can do this while
          // picking a printer) needs the queue to still be there.
          if (store) AsyncStorage.removeItem(printQueueStorageKey(store.id)).catch(() => {});
        }}
      />
      <AppModal visible={!!adjustingPiece} onRequestClose={() => setAdjustingPiece(null)}>
        {adjustingPiece && (
          <LogAdjustmentScreen piece={adjustingPiece} onClose={() => setAdjustingPiece(null)} />
        )}
      </AppModal>
      <HiddenScanCapture onScan={handleWedgeScan} enabled={scanCaptureEnabled} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#b00020', textAlign: 'center' },
  emptyText: { color: '#666', fontSize: 15, textAlign: 'center', padding: 24 },
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
  lowStockBadge: { fontSize: 12, color: '#b36b00', marginTop: 2, fontWeight: '600' },
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
  addButtonWrap: { position: 'relative' },
  addedBadge: {
    position: 'absolute',
    bottom: '100%',
    right: 0,
    marginBottom: 6,
    backgroundColor: '#2a7a2a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
    width: 140,
    alignItems: 'center',
  },
  addedBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  labelLink: { fontSize: 12, color: '#666', marginTop: 8, textDecorationLine: 'underline' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  footer: { gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  footerRow: { flexDirection: 'row', gap: 8 },
  importButton: {
    borderWidth: 1,
    borderColor: '#666',
    borderStyle: 'dashed',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  importButtonText: { color: '#444', fontWeight: '700', fontSize: 15 },
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
