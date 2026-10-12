import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { usePieces } from '../context/PiecesContext';
import { useDeals } from '../context/DealsContext';
import { colors } from '../lib/theme';

function dismissedStorageKey(storeId: string): string {
  return `onboardingDismissed:${storeId}`;
}

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  optional?: boolean;
  actionLabel: string;
  onPress: () => void;
}

export default function OnboardingChecklist({
  onAddPiece,
  onNavigate,
}: {
  onAddPiece: () => void;
  onNavigate: (page: 'deals' | 'settings') => void;
}) {
  const { store } = useAuth();
  const { pieces } = usePieces();
  const { deals } = useDeals();
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!store) return;
    AsyncStorage.getItem(dismissedStorageKey(store.id))
      .then((raw) => setDismissed(raw === 'true'))
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [store]);

  function dismiss() {
    setDismissed(true);
    if (store) AsyncStorage.setItem(dismissedStorageKey(store.id), 'true').catch(() => {});
  }

  if (!hydrated || dismissed || !store) return null;

  const items: ChecklistItem[] = [
    {
      key: 'piece',
      label: 'Add your first piece of inventory',
      done: pieces.length > 0,
      actionLabel: 'Add Piece',
      onPress: onAddPiece,
    },
    {
      key: 'stripe',
      label: 'Connect Stripe to accept card payments',
      done: store.stripe_onboarding_complete,
      optional: true,
      actionLabel: 'Go to Settings',
      onPress: () => onNavigate('settings'),
    },
    {
      key: 'deal',
      label: 'Set up your first deal',
      done: deals.length > 0,
      optional: true,
      actionLabel: 'Go to Deals',
      onPress: () => onNavigate('deals'),
    },
  ];

  // Nothing left to nudge about — stop taking up space rather than sit
  // here fully checked off forever.
  if (items.every((i) => i.done)) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Getting started</Text>
        <Pressable onPress={dismiss} hitSlop={10}>
          <Text style={styles.dismiss}>Hide</Text>
        </Pressable>
      </View>
      {items.map((item) => (
        <View key={item.key} style={styles.row}>
          <View style={[styles.checkbox, item.done && styles.checkboxChecked]}>
            {item.done && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, item.done && styles.rowLabelDone]}>
              {item.label}
              {item.optional && !item.done ? ' (optional)' : ''}
            </Text>
          </View>
          {!item.done && (
            <Pressable onPress={item.onPress}>
              <Text style={styles.actionLink}>{item.actionLabel}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    marginBottom: 0,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 10,
    gap: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  dismiss: { fontSize: 13, color: '#666' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2a7a2a', borderColor: '#2a7a2a' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 14, color: colors.ink },
  rowLabelDone: { color: '#999', textDecorationLine: 'line-through' },
  actionLink: { fontSize: 13, color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' },
});
