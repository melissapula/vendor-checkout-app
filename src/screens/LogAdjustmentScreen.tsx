import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AdjustmentType, Piece } from '../types/database';
import { usePieces } from '../context/PiecesContext';
import { useAdjustments } from '../context/AdjustmentsContext';
import { logInventoryAdjustment } from '../lib/adjustments';
import { appAlert } from '../lib/alert';

const TYPES: { value: AdjustmentType; label: string }[] = [
  { value: 'loss', label: 'Loss' },
  { value: 'donation', label: 'Donation' },
];

export default function LogAdjustmentScreen({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const { applyPieceUpdates } = usePieces();
  const { applyAdjustment } = useAdjustments();

  const [type, setType] = useState<AdjustmentType>('loss');
  const [quantityText, setQuantityText] = useState('1');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const quantity = parseInt(quantityText, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return appAlert('Invalid quantity', 'Enter a quantity of 1 or more.');
    }
    if (quantity > piece.quantity_remaining) {
      return appAlert(
        'Not enough stock',
        `Only ${piece.quantity_remaining} of ${piece.title} left — can't log ${quantity}.`
      );
    }

    setSubmitting(true);
    try {
      const result = await logInventoryAdjustment(piece.id, type, quantity, reason.trim() || null);
      applyPieceUpdates([result.piece]);
      applyAdjustment(result.adjustment);
      onClose();
    } catch (err) {
      appAlert('Could not log this', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Log loss or donation</Text>
      <Text style={styles.pieceTitle}>{piece.title}</Text>
      <Text style={styles.pieceMeta}>
        {piece.sku} · {piece.quantity_remaining} in stock
      </Text>

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => (
          <Pressable
            key={t.value}
            style={[styles.typeChip, type === t.value && styles.typeChipSelected]}
            onPress={() => setType(t.value)}
          >
            <Text style={[styles.typeChipText, type === t.value && styles.typeChipTextSelected]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Quantity</Text>
      <TextInput
        style={styles.input}
        value={quantityText}
        onChangeText={setQuantityText}
        keyboardType="number-pad"
        placeholder="1"
      />

      <Text style={styles.label}>Reason (optional)</Text>
      <TextInput
        style={styles.input}
        value={reason}
        onChangeText={setReason}
        placeholder={type === 'loss' ? 'e.g. Damaged at the last show' : 'e.g. Raffle prize'}
      />

      <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Log it</Text>}
      </Pressable>
      <Pressable disabled={submitting} onPress={onClose}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  pieceTitle: { fontSize: 16, fontWeight: '600' },
  pieceMeta: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 14, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0' },
  typeChipSelected: { backgroundColor: '#1a1a1a' },
  typeChipText: { fontWeight: '600', color: '#1a1a1a' },
  typeChipTextSelected: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 28,
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel: { textAlign: 'center', color: '#666', marginTop: 16 },
});
