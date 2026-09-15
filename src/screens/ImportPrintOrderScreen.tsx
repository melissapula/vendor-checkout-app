import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppModal from '../components/AppModal';
import { usePieces } from '../context/PiecesContext';
import { QueueEntry } from './PrintLabelsBuilderScreen';
import { Piece } from '../types/database';
import { appAlert } from '../lib/alert';
import { parseOrderFile, matchPieceForLine, topMatchesForLine, ParsedOrderLine } from '../lib/orderImport';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';

// A hidden real <input type="file"> — react-native-web's own primitives
// have no file-picker equivalent, and this is a web-only app, so this
// reaches for the DOM directly the same way AppModal/AlertHost already do
// for other browser-only needs. Kept as a stable DOM node across renders
// (not recreated per click) so listeners never leak.
function useFilePicker(accept: string, onFile: (file: File) => void) {
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    // Positioned off-screen with zero opacity rather than `display:none` —
    // same reasoning as HiddenScanCapture.tsx's invisible TextInput: a
    // display:none element isn't part of the rendered accessibility tree at
    // all (assistive tech and some automation tooling skip it entirely),
    // while this stays a real, technically-visible node.
    Object.assign(input.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      width: '1px',
      height: '1px',
      opacity: '0',
    });
    function handleChange() {
      const file = input.files?.[0];
      if (file) onFileRef.current(file);
      input.value = '';
    }
    input.addEventListener('change', handleChange);
    document.body.appendChild(input);
    inputRef.current = input;
    return () => {
      input.removeEventListener('change', handleChange);
      document.body.removeChild(input);
    };
  }, [accept]);

  return () => inputRef.current?.click();
}

type Selection = { type: 'match'; pieceId: string } | { type: 'new' } | { type: 'skip' };

interface ReviewRow {
  line: ParsedOrderLine;
  candidates: Piece[];
  selection: Selection;
  quantityText: string;
  newTitle: string;
  newPriceText: string;
  newSize: string;
  newType: string;
}

function buildReviewRow(line: ParsedOrderLine, pieces: Piece[]): ReviewRow {
  const confidentMatch = matchPieceForLine(line, pieces);
  return {
    line,
    candidates: topMatchesForLine(line, pieces, 3),
    selection: confidentMatch ? { type: 'match', pieceId: confidentMatch.id } : { type: 'skip' },
    quantityText: String(line.quantity),
    newTitle: line.guessedTitle,
    newPriceText: '',
    newSize: line.guessedSize ?? '',
    newType: 'print',
  };
}

function PiecePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (piece: Piece) => void;
}) {
  const { pieces } = usePieces();
  const [search, setSearch] = useState('');

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = q
      ? pieces.filter((p) => p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : pieces;
    return [...matches].sort((a, b) => a.title.localeCompare(b.title)).slice(0, q ? 20 : 50);
  }, [pieces, search]);

  return (
    <AppModal visible={visible} onRequestClose={onClose}>
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <Text style={styles.pickerHeading}>Find the Right Piece</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by title or SKU…"
          autoFocus
        />
        <ScrollView style={styles.pickerList}>
          {results.map((p) => (
            <Pressable
              key={p.id}
              style={styles.pickerRow}
              onPress={() => {
                onPick(p);
                onClose();
              }}
            >
              <Text style={styles.pickerRowTitle}>{p.title}</Text>
              <Text style={styles.pickerRowMeta}>
                {p.sku} · {p.type}
                {p.size ? ` · ${p.size}` : ''} · {p.quantity_remaining} in stock
              </Text>
            </Pressable>
          ))}
          {results.length === 0 && <Text style={styles.emptyText}>No matching pieces.</Text>}
        </ScrollView>
      </View>
    </AppModal>
  );
}

function candidateLabel(piece: Piece): string {
  return piece.size ? `${piece.title} (${piece.size})` : piece.title;
}

function selectionIsMatch(selection: Selection, pieceId: string): boolean {
  return selection.type === 'match' && selection.pieceId === pieceId;
}

function RowEditor({
  row,
  index,
  onChange,
  onOpenPicker,
}: {
  row: ReviewRow;
  index: number;
  onChange: (updates: Partial<ReviewRow>) => void;
  onOpenPicker: () => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rawText} numberOfLines={2}>
        "{row.line.rawText}"
      </Text>

      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, row.selection.type === 'skip' && styles.chipSelected]}
          onPress={() => onChange({ selection: { type: 'skip' } })}
        >
          <Text style={[styles.chipText, row.selection.type === 'skip' && styles.chipTextSelected]}>Skip</Text>
        </Pressable>
        {row.candidates.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.chip, selectionIsMatch(row.selection, c.id) && styles.chipSelected]}
            onPress={() => onChange({ selection: { type: 'match', pieceId: c.id } })}
          >
            <Text style={[styles.chipText, selectionIsMatch(row.selection, c.id) && styles.chipTextSelected]}>
              {candidateLabel(c)}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, row.selection.type === 'new' && styles.chipSelected]}
          onPress={() => onChange({ selection: { type: 'new' } })}
        >
          <Text style={[styles.chipText, row.selection.type === 'new' && styles.chipTextSelected]}>+ New piece</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={onOpenPicker}>
          <Text style={styles.chipText}>🔍 Search…</Text>
        </Pressable>
      </View>

      {row.selection.type === 'new' && (
        <View style={styles.newPieceForm}>
          <TextInput
            style={styles.input}
            value={row.newTitle}
            onChangeText={(t) => onChange({ newTitle: t })}
            placeholder="Title"
          />
          <View style={styles.newPieceRow}>
            <TextInput
              style={[styles.input, styles.newPieceHalf]}
              value={row.newPriceText}
              onChangeText={(t) => onChange({ newPriceText: t })}
              placeholder="Price ($)"
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, styles.newPieceHalf]}
              value={row.newType}
              onChangeText={(t) => onChange({ newType: t })}
              placeholder="Type (e.g. print)"
            />
          </View>
          <TextInput
            style={styles.input}
            value={row.newSize}
            onChangeText={(t) => onChange({ newSize: t })}
            placeholder="Size (optional, e.g. 4x6)"
          />
        </View>
      )}

      {row.selection.type !== 'skip' && (
        <View style={styles.qtyRow}>
          <Text style={styles.qtyLabel}>Quantity ordered</Text>
          <TextInput
            style={styles.qtyInput}
            value={row.quantityText}
            onChangeText={(t) => onChange({ quantityText: t })}
            keyboardType="number-pad"
          />
        </View>
      )}
    </View>
  );
}

export default function ImportPrintOrderScreen({
  onClose,
  onImported,
}: {
  onClose: () => void;
  // Handed the pieces (with their post-import quantity) and how many of
  // each were just added — the caller (InventoryScreen) offers to open
  // Print Labels pre-queued with exactly these.
  onImported: (entries: QueueEntry[]) => void;
}) {
  const { pieces, addPiece, updatePiece } = usePieces();
  const [phase, setPhase] = useState<'upload' | 'parsing' | 'review'>('upload');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickerForIndex, setPickerForIndex] = useState<number | null>(null);
  const { isTabletUp } = useBreakpoint();

  async function handleFile(file: File) {
    setPhase('parsing');
    setError(null);
    try {
      const lines = await parseOrderFile(file);
      if (lines.length === 0) {
        setError("Couldn't find any item rows in that file — try the other format, or check it isn't a scanned image (this can only read real text, not a photo of a page).");
        setPhase('upload');
        return;
      }
      setRows(lines.map((line) => buildReviewRow(line, pieces)));
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setPhase('upload');
    }
  }

  const pickFile = useFilePicker('.csv,.pdf,text/csv,application/pdf', handleFile);

  function updateRow(index: number, updates: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  }

  const includedCount = rows.filter((r) => r.selection.type !== 'skip').length;

  async function handleApply() {
    // Validate every included row up front so a mistake three rows in
    // doesn't leave the first two already written to the database while
    // the rest silently never happen.
    for (const row of rows) {
      if (row.selection.type === 'skip') continue;
      const qty = parseInt(row.quantityText, 10);
      if (!qty || qty <= 0) {
        return appAlert('Invalid quantity', `Enter a quantity of 1 or more for "${row.line.rawText}", or skip it.`);
      }
      if (row.selection.type === 'new') {
        const price = parseFloat(row.newPriceText);
        if (!row.newTitle.trim()) {
          return appAlert('Missing title', `Give a title for "${row.line.rawText}", or match it to an existing piece instead.`);
        }
        if (isNaN(price) || price < 0) {
          return appAlert('Missing price', `Enter a price for "${row.newTitle.trim()}".`);
        }
      }
    }

    setSubmitting(true);
    try {
      const resultEntries: QueueEntry[] = [];
      for (const row of rows) {
        if (row.selection.type === 'skip') continue;
        const qty = parseInt(row.quantityText, 10);

        if (row.selection.type === 'match') {
          const pieceId = row.selection.pieceId;
          const piece = pieces.find((p) => p.id === pieceId);
          if (!piece) continue; // deleted from under us mid-review — skip rather than crash
          const newQuantity = piece.quantity_remaining + qty;
          const updates = {
            quantity_remaining: newQuantity,
            // A print that had sold all the way out gets auto-marked
            // 'sold' by finalize_sale — restocking it should un-sell it,
            // same as refund_sale already does for a single refunded unit.
            status: piece.status === 'sold' ? ('available' as const) : piece.status,
          };
          await updatePiece(piece.id, updates);
          resultEntries.push({ piece: { ...piece, ...updates }, quantity: qty });
        } else {
          const newPiece = await addPiece({
            sku: `IMPORT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            title: row.newTitle.trim(),
            medium: null,
            width_in: null,
            height_in: null,
            series: null,
            size: row.newSize.trim() || null,
            price: parseFloat(row.newPriceText),
            cost_basis: null,
            status: 'available',
            type: row.newType.trim() || 'print',
            original_id: null,
            print_run_size: null,
            quantity_remaining: qty,
            date_sold: null,
            sale_channel: null,
            notes: null,
            image_url: null,
            info_url: null,
          });
          resultEntries.push({ piece: newPiece, quantity: qty });
        }
      }
      onImported(resultEntries);
    } catch (err) {
      appAlert('Import failed', err instanceof Error ? err.message : 'Something went wrong applying this order.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Import Print Order</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      {phase === 'upload' && (
        <View style={[styles.uploadBody, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
          <Text style={styles.uploadText}>
            Upload a print order confirmation from your print vendor (PDF or CSV). This reads the items,
            quantities, and sizes, lets you confirm each one against your inventory, then updates stock and
            offers to print labels for everything you just added.
          </Text>
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.uploadButton} onPress={pickFile}>
            <Text style={styles.uploadButtonText}>Choose PDF or CSV File</Text>
          </Pressable>
        </View>
      )}

      {phase === 'parsing' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.uploadText}>Reading file…</Text>
        </View>
      )}

      {phase === 'review' && (
        <>
          <ScrollView style={styles.list} contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}>
            <Text style={styles.reviewHint}>
              Review each line below — matches and quantities are best-effort guesses from the file. Fix
              anything wrong before continuing; nothing is saved until you tap Continue.
            </Text>
            {rows.map((row, i) => (
              <RowEditor
                key={row.line.id}
                row={row}
                index={i}
                onChange={(updates) => updateRow(i, updates)}
                onOpenPicker={() => setPickerForIndex(i)}
              />
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Text style={styles.totalText}>
              {includedCount} of {rows.length} row{rows.length === 1 ? '' : 's'} will update inventory
            </Text>
            <Pressable
              style={[styles.applyButton, (submitting || includedCount === 0) && styles.applyButtonDisabled]}
              disabled={submitting || includedCount === 0}
              onPress={handleApply}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.applyButtonText}>Update Inventory & Continue</Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      <PiecePickerModal
        visible={pickerForIndex !== null}
        onClose={() => setPickerForIndex(null)}
        onPick={(piece) => {
          if (pickerForIndex !== null) updateRow(pickerForIndex, { selection: { type: 'match', pieceId: piece.id } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  cancel: { color: '#666', fontSize: 15 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  uploadBody: { flex: 1, padding: 24, justifyContent: 'center', gap: 20 },
  uploadText: { fontSize: 15, color: '#444', lineHeight: 22, textAlign: 'center' },
  uploadButton: { backgroundColor: '#1a1a1a', paddingVertical: 16, borderRadius: 10, alignItems: 'center' },
  uploadButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#b00020', textAlign: 'center', fontSize: 14 },
  list: { flex: 1 },
  reviewHint: { fontSize: 13, color: '#666', padding: 16, paddingBottom: 8 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 10 },
  rawText: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  newPieceForm: { gap: 8, marginTop: 4 },
  newPieceRow: { flexDirection: 'row', gap: 8 },
  newPieceHalf: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyLabel: { fontSize: 13, color: '#666' },
  qtyInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    width: 70,
  },
  footer: { borderTopWidth: 1, borderTopColor: '#eee', padding: 16, gap: 10 },
  totalText: { fontSize: 13, color: '#666', textAlign: 'center' },
  applyButton: { backgroundColor: '#1a1a1a', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  applyButtonDisabled: { backgroundColor: '#ccc' },
  applyButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  pickerContainer: { flex: 1, backgroundColor: '#fff' },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pickerHeading: { fontSize: 17, fontWeight: '700' },
  closeText: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
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
  pickerList: { flex: 1 },
  pickerRow: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  pickerRowTitle: { fontSize: 15, fontWeight: '600' },
  pickerRowMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  emptyText: { color: '#999', textAlign: 'center', padding: 24 },
});
