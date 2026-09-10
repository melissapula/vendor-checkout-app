import React, { useMemo, useState } from 'react';
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
import { useDeals } from '../context/DealsContext';
import { usePieces } from '../context/PiecesContext';
import { AppliesTo } from '../lib/deals';
import { appAlert } from '../lib/alert';
import { Deal, DealType, PieceType } from '../types/database';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';

const DEAL_TYPES: { key: DealType; label: string }[] = [
  { key: 'percent_off', label: 'Percent off' },
  { key: 'amount_off', label: 'Amount off' },
  { key: 'bundle_price', label: 'Bundle price' },
  { key: 'bogo', label: 'Buy X get Y free' },
];

const TRIGGER_HELP: Record<DealType, string> = {
  percent_off: 'Minimum qty in cart to trigger — e.g. 3 for "3+ items"',
  amount_off: 'Minimum qty in cart to trigger — e.g. 3 for "3+ items"',
  bundle_price: 'Items per bundle — e.g. 2 for "2-for-$X"',
  bogo: 'Cycle size — e.g. 4 for "buy 3, get 1 free"',
};

const DISCOUNT_LABEL: Record<DealType, string> = {
  percent_off: 'Percent off (%)',
  amount_off: 'Amount off ($)',
  bundle_price: 'Bundle price ($)',
  bogo: 'Free items per cycle (usually 1)',
};

type Scope = 'all' | 'type' | 'skus';

function parseAppliesTo(deal: Deal | undefined): { scope: Scope; type: PieceType; skusText: string } {
  const appliesTo = deal?.applies_to as unknown as AppliesTo | undefined;
  if (!appliesTo || appliesTo.scope === 'all') return { scope: 'all', type: 'print', skusText: '' };
  if (appliesTo.scope === 'type') return { scope: 'type', type: appliesTo.type, skusText: '' };
  if (appliesTo.scope === 'skus') return { scope: 'all', type: 'print', skusText: appliesTo.skus.join(', ') };
  // 'series' scope isn't editable here yet (no piece has a series set) —
  // fall back to 'all' rather than silently dropping the deal's real scope.
  return { scope: 'all', type: 'print', skusText: '' };
}

export default function DealFormScreen({
  deal,
  onClose,
}: {
  deal?: Deal;
  onClose: () => void;
}) {
  const { addDeal, updateDeal, deleteDeal } = useDeals();
  const { pieces } = usePieces();
  const [submitting, setSubmitting] = useState(false);
  const { isTabletUp } = useBreakpoint();

  const initialScope = useMemo(() => parseAppliesTo(deal), [deal]);

  const [name, setName] = useState(deal?.name ?? '');
  const [type, setType] = useState<DealType>(deal?.type ?? 'percent_off');
  const [triggerCount, setTriggerCount] = useState(
    deal ? String((deal.trigger_condition as any)?.count ?? '') : ''
  );
  const [discountValue, setDiscountValue] = useState(deal ? String(deal.discount_value) : '');
  const [stackable, setStackable] = useState(deal?.stackable ?? false);
  const [active, setActive] = useState(deal?.active ?? true);
  const [scope, setScope] = useState<Scope>(
    initialScope.skusText ? 'skus' : initialScope.scope
  );
  const [scopeType, setScopeType] = useState<PieceType>(initialScope.type);
  const [skusText, setSkusText] = useState(initialScope.skusText);
  const [startDate, setStartDate] = useState(deal?.start_date?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(deal?.end_date?.slice(0, 10) ?? '');

  const pieceTypes = useMemo(
    () => Array.from(new Set(pieces.map((p) => p.type))).sort(),
    [pieces]
  );

  function buildAppliesTo(): AppliesTo {
    if (scope === 'type') return { scope: 'type', type: scopeType };
    if (scope === 'skus') {
      const skus = skusText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return { scope: 'skus', skus };
    }
    return { scope: 'all' };
  }

  function parseOptionalDate(text: string): string | null {
    if (!text.trim()) return null;
    const d = new Date(text.trim());
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function handleSave() {
    const count = parseInt(triggerCount, 10);
    const value = parseFloat(discountValue);

    if (!name.trim()) return appAlert('Missing name', 'Give this deal a name.');
    if (!count || count <= 0) return appAlert('Invalid trigger', TRIGGER_HELP[type]);
    if (isNaN(value) || value < 0) return appAlert('Invalid discount', 'Enter a discount value.');
    if (scope === 'skus' && !skusText.trim()) {
      return appAlert('Missing SKUs', 'Enter at least one SKU, comma-separated.');
    }

    const payload = {
      name: name.trim(),
      type,
      trigger_condition: { count } as Record<string, unknown>,
      discount_value: value,
      stackable,
      active,
      applies_to: buildAppliesTo() as unknown as Record<string, unknown>,
      start_date: parseOptionalDate(startDate),
      end_date: parseOptionalDate(endDate),
    };

    setSubmitting(true);
    try {
      if (deal) {
        await updateDeal(deal.id, payload);
      } else {
        await addDeal(payload);
      }
      onClose();
    } catch (err) {
      appAlert('Save failed', err instanceof Error ? err.message : 'Could not save this deal.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete() {
    if (!deal) return;
    appAlert('Delete this deal?', deal.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            await deleteDeal(deal.id);
            onClose();
          } catch (err) {
            appAlert('Delete failed', err instanceof Error ? err.message : 'Could not delete this deal.');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <Text style={styles.heading}>{deal ? 'Edit Deal' : 'New Deal'}</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder='e.g. "3+ Prints — 15% Off"'
        />

        <Text style={styles.label}>Deal type</Text>
        <View style={styles.chipRow}>
          {DEAL_TYPES.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.chip, type === t.key && styles.chipSelected]}
              onPress={() => setType(t.key)}
            >
              <Text style={[styles.chipText, type === t.key && styles.chipTextSelected]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{TRIGGER_HELP[type]}</Text>
        <TextInput
          style={styles.input}
          value={triggerCount}
          onChangeText={setTriggerCount}
          keyboardType="number-pad"
          placeholder="e.g. 3"
        />

        <Text style={styles.label}>{DISCOUNT_LABEL[type]}</Text>
        <TextInput
          style={styles.input}
          value={discountValue}
          onChangeText={setDiscountValue}
          keyboardType="decimal-pad"
          placeholder="e.g. 15"
        />

        <Text style={styles.label}>Applies to</Text>
        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, scope === 'all' && styles.chipSelected]}
            onPress={() => setScope('all')}
          >
            <Text style={[styles.chipText, scope === 'all' && styles.chipTextSelected]}>
              All items
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, scope === 'type' && styles.chipSelected]}
            onPress={() => setScope('type')}
          >
            <Text style={[styles.chipText, scope === 'type' && styles.chipTextSelected]}>
              By type
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, scope === 'skus' && styles.chipSelected]}
            onPress={() => setScope('skus')}
          >
            <Text style={[styles.chipText, scope === 'skus' && styles.chipTextSelected]}>
              By SKU list
            </Text>
          </Pressable>
        </View>

        {scope === 'type' && (
          <View style={styles.chipRow}>
            {pieceTypes.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, scopeType === t && styles.chipSelected]}
                onPress={() => setScopeType(t)}
              >
                <Text style={[styles.chipText, scopeType === t && styles.chipTextSelected]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {scope === 'skus' && (
          <TextInput
            style={styles.input}
            value={skusText}
            onChangeText={setSkusText}
            placeholder="e.g. FSS-0001, FSS-0002-4X6"
            autoCapitalize="characters"
          />
        )}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Stackable (combines with other deals)</Text>
          <Switch value={stackable} onValueChange={setStackable} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Active</Text>
          <Switch value={active} onValueChange={setActive} />
        </View>

        <Text style={styles.label}>Start date (optional, YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="2026-08-01"
        />
        <Text style={styles.label}>End date (optional, YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="2026-08-31"
        />
      </ScrollView>

      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
        <Pressable
          style={[styles.saveButton, submitting && styles.disabled]}
          disabled={submitting}
          onPress={handleSave}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </Pressable>
        {deal && (
          <Pressable disabled={submitting} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete deal</Text>
          </Pressable>
        )}
        <Pressable disabled={submitting} onPress={onClose}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 16 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  chipSelected: { backgroundColor: '#1a1a1a' },
  chipText: { fontWeight: '600', color: '#1a1a1a' },
  chipTextSelected: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  saveButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteText: { textAlign: 'center', color: '#b00020', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666' },
});
