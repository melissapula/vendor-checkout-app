import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePieces } from '../context/PiecesContext';
import { Piece } from '../types/database';

export default function EditPieceScreen({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  const { updatePiece } = usePieces();
  const [price, setPrice] = useState(String(piece.price));
  const [quantity, setQuantity] = useState(String(piece.quantity_remaining));
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    const priceValue = parseFloat(price);
    const quantityValue = parseInt(quantity, 10);

    if (isNaN(priceValue) || priceValue < 0) {
      return Alert.alert('Invalid price', 'Enter a price of $0 or more.');
    }
    if (isNaN(quantityValue) || quantityValue < 0) {
      return Alert.alert('Invalid quantity', 'Enter a quantity of 0 or more.');
    }

    setSubmitting(true);
    try {
      await updatePiece(piece.id, {
        price: priceValue,
        quantity_remaining: quantityValue,
        // Editing stock back up should un-mark a piece as sold — e.g.
        // correcting a placeholder count that was wrongly left at 0.
        status: quantityValue > 0 && piece.status === 'sold' ? 'available' : piece.status,
      });
      onClose();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not update this piece.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{piece.title}</Text>
      <Text style={styles.sku}>{piece.sku}</Text>

      <Text style={styles.label}>Price ($)</Text>
      <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

      <Text style={styles.label}>Quantity remaining</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />

      <View style={styles.footer}>
        <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </Pressable>
        <Pressable disabled={submitting} onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  heading: { fontSize: 20, fontWeight: '700' },
  sku: { fontSize: 13, color: '#666', marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  footer: { marginTop: 32, gap: 10 },
  saveButton: { backgroundColor: '#1a1a1a', paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancel: { textAlign: 'center', color: '#666' },
});
