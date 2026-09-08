import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSales } from '../context/SalesContext';
import { usePieces } from '../context/PiecesContext';
import { Sale, PaymentMethod, PieceType } from '../types/database';

type DateRange = 'today' | '7days' | 'all' | 'custom';

const PAYMENT_METHODS: PaymentMethod[] = ['square', 'venmo', 'paypal', 'cash'];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// `new Date('YYYY-MM-DD')` parses as UTC midnight per spec, but .setHours()
// mutates in local time — mixing the two silently shifts the boundary by a
// timezone offset (e.g. cuts off hours early in US time zones), which can
// exclude real same-day sales from a report. Parsing y/m/d into the
// (year, month, day) constructor form keeps everything in local time.
function parseLocalDate(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isWithinRange(iso: string, range: DateRange, from: string, to: string): boolean {
  const date = new Date(iso);
  if (range === 'all') return true;
  if (range === 'today') return date >= startOfToday();
  if (range === '7days') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return date >= cutoff;
  }
  // custom
  const fromDate = from ? parseLocalDate(from) : null;
  if (fromDate && date < fromDate) return false;
  const toDate = to ? parseLocalDate(to) : null;
  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
    if (date > toDate) return false;
  }
  return true;
}

export default function ReportsScreen() {
  const { sales, loading, error } = useSales();
  const { pieces } = usePieces();

  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PieceType | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<string | 'all'>('all');

  const pieceById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const knownTypes = useMemo(() => Array.from(new Set(pieces.map((p) => p.type))).sort(), [pieces]);
  const knownLocations = useMemo(
    () => Array.from(new Set(sales.map((s) => s.location).filter((l): l is string => !!l))).sort(),
    [sales]
  );

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (!isWithinRange(s.sale_date, dateRange, customFrom, customTo)) return false;
      if (methodFilter !== 'all' && s.payment_method !== methodFilter) return false;
      if (locationFilter !== 'all' && s.location !== locationFilter) return false;
      if (typeFilter !== 'all') {
        const piece = pieceById.get(s.piece_id);
        if (!piece || piece.type !== typeFilter) return false;
      }
      return true;
    });
  }, [sales, dateRange, customFrom, customTo, methodFilter, typeFilter, locationFilter, pieceById]);

  const summary = useMemo(() => {
    const gross = filtered.reduce((sum, s) => sum + s.sale_price, 0);
    const fees = filtered.reduce((sum, s) => sum + s.fee_amount, 0);
    const tips = filtered.reduce((sum, s) => sum + (s.tip_amount ?? 0), 0);
    return { gross, fees, tips, net: gross - fees, count: filtered.length };
  }, [filtered]);

  const byType = useMemo(() => {
    const map = new Map<string, { count: number; gross: number }>();
    for (const s of filtered) {
      const type = pieceById.get(s.piece_id)?.type ?? 'unknown';
      const entry = map.get(type) ?? { count: 0, gross: 0 };
      entry.count += 1;
      entry.gross += s.sale_price;
      map.set(type, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].gross - a[1].gross);
  }, [filtered, pieceById]);

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
        <Text style={styles.errorText}>Couldn't load sales: {error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={filtered}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => <SaleRow sale={item} title={pieceById.get(item.piece_id)?.title ?? 'Unknown item'} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No sales match these filters.</Text>}
      ListHeaderComponent={
        <View style={styles.filters}>
          <Text style={styles.filterLabel}>Date range</Text>
          <View style={styles.chipRow}>
            {(['today', '7days', 'all', 'custom'] as DateRange[]).map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, dateRange === r && styles.chipSelected]}
                onPress={() => setDateRange(r)}
              >
                <Text style={[styles.chipText, dateRange === r && styles.chipTextSelected]}>
                  {r === 'today' ? 'Today' : r === '7days' ? 'Last 7 days' : r === 'all' ? 'All time' : 'Custom'}
                </Text>
              </Pressable>
            ))}
          </View>
          {dateRange === 'custom' && (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.half]}
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="From YYYY-MM-DD"
              />
              <TextInput
                style={[styles.input, styles.half]}
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="To YYYY-MM-DD"
              />
            </View>
          )}

          <Text style={styles.filterLabel}>Payment method</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, methodFilter === 'all' && styles.chipSelected]}
              onPress={() => setMethodFilter('all')}
            >
              <Text style={[styles.chipText, methodFilter === 'all' && styles.chipTextSelected]}>All</Text>
            </Pressable>
            {PAYMENT_METHODS.map((m) => (
              <Pressable
                key={m}
                style={[styles.chip, methodFilter === m && styles.chipSelected]}
                onPress={() => setMethodFilter(m)}
              >
                <Text style={[styles.chipText, methodFilter === m && styles.chipTextSelected]}>{m}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.filterLabel}>Item type</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, typeFilter === 'all' && styles.chipSelected]}
              onPress={() => setTypeFilter('all')}
            >
              <Text style={[styles.chipText, typeFilter === 'all' && styles.chipTextSelected]}>All</Text>
            </Pressable>
            {knownTypes.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, typeFilter === t && styles.chipSelected]}
                onPress={() => setTypeFilter(t)}
              >
                <Text style={[styles.chipText, typeFilter === t && styles.chipTextSelected]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {knownLocations.length > 0 && (
            <>
              <Text style={styles.filterLabel}>Show / venue</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, locationFilter === 'all' && styles.chipSelected]}
                  onPress={() => setLocationFilter('all')}
                >
                  <Text style={[styles.chipText, locationFilter === 'all' && styles.chipTextSelected]}>All</Text>
                </Pressable>
                {knownLocations.map((l) => (
                  <Pressable
                    key={l}
                    style={[styles.chip, locationFilter === l && styles.chipSelected]}
                    onPress={() => setLocationFilter(l)}
                  >
                    <Text style={[styles.chipText, locationFilter === l && styles.chipTextSelected]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={styles.summaryBox}>
            <SummaryRow label="Items sold" value={summary.count} isCount />
            <SummaryRow label="Gross sales" value={summary.gross} />
            <SummaryRow label="Tips collected" value={summary.tips} />
            <SummaryRow label="Fees deducted" value={-summary.fees} muted />
            <SummaryRow label="Net revenue" value={summary.net} bold />
          </View>

          {byType.length > 0 && (
            <View style={styles.summaryBox}>
              <Text style={styles.filterLabel}>By type</Text>
              {byType.map(([type, stats]) => (
                <View key={type} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {type} ({stats.count})
                  </Text>
                  <Text style={styles.summaryValue}>${stats.gross.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.filterLabel}>Sales ({filtered.length})</Text>
        </View>
      }
    />
  );
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
  isCount,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  isCount?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, muted && styles.muted]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.bold, muted && styles.muted]}>
        {isCount ? value : `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`}
      </Text>
    </View>
  );
}

function SaleRow({ sale, title }: { sale: Sale; title: string }) {
  return (
    <View style={styles.saleRow}>
      <View style={styles.saleInfo}>
        <Text style={styles.saleTitle}>{title}</Text>
        <Text style={styles.saleMeta}>
          {new Date(sale.sale_date).toLocaleString()} · {sale.payment_method}
          {sale.location ? ` · ${sale.location}` : ''}
        </Text>
      </View>
      <View style={styles.saleAmounts}>
        <Text style={styles.salePrice}>${sale.sale_price.toFixed(2)}</Text>
        {sale.tip_amount ? <Text style={styles.saleTip}>+${sale.tip_amount.toFixed(2)} tip</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#b00020', textAlign: 'center' },
  emptyText: { color: '#666', textAlign: 'center', padding: 24 },
  filters: { padding: 16 },
  filterLabel: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f0f0' },
  chipSelected: { backgroundColor: '#1a1a1a' },
  chipText: { fontWeight: '600', color: '#1a1a1a' },
  chipTextSelected: { color: '#fff' },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  half: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  summaryBox: { marginTop: 20, padding: 16, backgroundColor: '#f7f7f7', borderRadius: 10, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 15, color: '#333' },
  summaryValue: { fontSize: 15, color: '#333' },
  bold: { fontWeight: '700', fontSize: 17 },
  muted: { color: '#888' },
  saleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saleInfo: { flex: 1, marginRight: 12 },
  saleTitle: { fontSize: 15, fontWeight: '600' },
  saleMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  saleAmounts: { alignItems: 'flex-end' },
  salePrice: { fontSize: 15, fontWeight: '600' },
  saleTip: { fontSize: 12, color: '#2a7a2a', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
});
