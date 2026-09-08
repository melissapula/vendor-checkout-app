import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useDeals } from '../context/DealsContext';
import { AppliesTo } from '../lib/deals';
import { Deal } from '../types/database';
import DealFormScreen from './DealFormScreen';

function describeScope(deal: Deal): string {
  const appliesTo = deal.applies_to as unknown as AppliesTo;
  if (appliesTo.scope === 'all') return 'All items';
  if (appliesTo.scope === 'type') return `Type: ${appliesTo.type}`;
  if (appliesTo.scope === 'series') return `Series: ${appliesTo.series}`;
  if (appliesTo.scope === 'skus') return `${appliesTo.skus.length} SKU(s)`;
  return '';
}

function describeTrigger(deal: Deal): string {
  const count = (deal.trigger_condition as any)?.count;
  switch (deal.type) {
    case 'percent_off':
      return `${count}+ items → ${deal.discount_value}% off`;
    case 'amount_off':
      return `${count}+ items → $${deal.discount_value} off`;
    case 'bundle_price':
      return `${count} for $${deal.discount_value}`;
    case 'bogo':
      return `Every ${count} → ${deal.discount_value} free`;
  }
}

function DealRow({ deal, onPress }: { deal: Deal; onPress: () => void }) {
  const { updateDeal } = useDeals();

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowInfo}>
        <Text style={[styles.title, !deal.active && styles.inactiveText]}>{deal.name}</Text>
        <Text style={styles.meta}>
          {describeTrigger(deal)} · {describeScope(deal)}
        </Text>
        {deal.stackable && <Text style={styles.stackable}>Stackable</Text>}
      </View>
      <Switch
        value={deal.active}
        onValueChange={(value) => updateDeal(deal.id, { active: value })}
      />
    </Pressable>
  );
}

export default function DealsScreen() {
  const { deals, loading, error } = useDeals();
  const [editingDeal, setEditingDeal] = useState<Deal | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);

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
        <Text style={styles.errorText}>Couldn't load deals: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {deals.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No deals yet — tap "Add Deal" to create one.</Text>
        </View>
      ) : (
        <FlatList
          data={deals}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <DealRow
              deal={item}
              onPress={() => {
                setEditingDeal(item);
                setFormOpen(true);
              }}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={styles.addButton}
          onPress={() => {
            setEditingDeal(undefined);
            setFormOpen(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Add Deal</Text>
        </Pressable>
      </View>

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <DealFormScreen deal={editingDeal} onClose={() => setFormOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#b00020', textAlign: 'center' },
  emptyText: { color: '#666', fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  inactiveText: { color: '#999' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  stackable: { fontSize: 12, color: '#2a7a2a', marginTop: 4, fontWeight: '600' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  addButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
