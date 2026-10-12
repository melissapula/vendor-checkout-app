import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppModal from '../components/AppModal';
import EventsScreen from './EventsScreen';
import { useSales } from '../context/SalesContext';
import { usePieces } from '../context/PiecesContext';
import { useAdjustments } from '../context/AdjustmentsContext';
import { useEvents, eventForDate } from '../context/EventsContext';
import { useSavedReports } from '../context/SavedReportsContext';
import { useAuth } from '../context/AuthContext';
import {
  Sale,
  PaymentMethod,
  PieceType,
  AdjustmentType,
  InventoryAdjustment,
  SavedReport,
  ReportSnapshot,
} from '../types/database';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { refundSale } from '../lib/refunds';
import { appAlert } from '../lib/alert';
import { salesGroupedBy, salesOverTime } from '../lib/reportCharts';
import { RankedBarChart, TimeBarChart } from '../components/ReportCharts';
import { colors } from '../lib/theme';
import { paymentMethodLabel, typeLabel } from '../lib/labels';

type DateRange = 'today' | '7days' | 'all' | 'custom';

const PAYMENT_METHODS: PaymentMethod[] = ['card', 'venmo', 'paypal', 'cash_app', 'cash'];

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

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Concrete YYYY-MM-DD bounds for whichever date-range mode is active —
// needed when saving a report snapshot, since 'today'/'7days' aren't
// concrete dates on their own the way 'custom' already is.
function resolveDateRangeBounds(range: DateRange, from: string, to: string): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  if (range === 'today') {
    const today = toYMD(new Date());
    return { from: today, to: today };
  }
  if (range === '7days') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return { from: toYMD(cutoff), to: toYMD(new Date()) };
  }
  return { from: from.trim() || null, to: to.trim() || null };
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
  const [view, setView] = useState<'sales' | 'adjustments' | 'saved'>('sales');
  const [eventsOpen, setEventsOpen] = useState(false);
  const { isTabletUp } = useBreakpoint();

  return (
    <View style={styles.screen}>
      <View style={[styles.viewToggleRow, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <View style={styles.viewToggle}>
        <Pressable
          style={[styles.viewChip, view === 'sales' && styles.viewChipSelected]}
          onPress={() => setView('sales')}
        >
          <Text style={[styles.viewChipText, view === 'sales' && styles.viewChipTextSelected]}>Sales</Text>
        </Pressable>
        <Pressable
          style={[styles.viewChip, view === 'adjustments' && styles.viewChipSelected]}
          onPress={() => setView('adjustments')}
        >
          <Text style={[styles.viewChipText, view === 'adjustments' && styles.viewChipTextSelected]}>
            Losses &amp; Donations
          </Text>
        </Pressable>
        <Pressable
          style={[styles.viewChip, view === 'saved' && styles.viewChipSelected]}
          onPress={() => setView('saved')}
        >
          <Text style={[styles.viewChipText, view === 'saved' && styles.viewChipTextSelected]}>Saved Reports</Text>
        </Pressable>
        </View>
      </View>
      {view === 'sales' ? <SalesReport onManageEvents={() => setEventsOpen(true)} /> : view === 'adjustments' ? <AdjustmentsReport /> : <SavedReportsView />}

      <AppModal visible={eventsOpen} onRequestClose={() => setEventsOpen(false)}>
        <EventsScreen onClose={() => setEventsOpen(false)} />
      </AppModal>
    </View>
  );
}

function SalesReport({ onManageEvents }: { onManageEvents: () => void }) {
  const { sales, loading, error, applySaleUpdate } = useSales();
  const { pieces, applyPieceUpdates } = usePieces();
  const { events } = useEvents();
  const { addSavedReport } = useSavedReports();
  const { isDemo } = useAuth();

  // The demo store's sales are all in the past, so "Today" would greet a
  // visitor with an empty report.
  const [dateRange, setDateRange] = useState<DateRange>(isDemo ? 'all' : 'today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PieceType | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<string | 'all'>('all');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const { isTabletUp } = useBreakpoint();

  const pieceById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const knownTypes = useMemo(() => Array.from(new Set(pieces.map((p) => p.type))).sort(), [pieces]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (!isWithinRange(s.sale_date, dateRange, customFrom, customTo)) return false;
      if (methodFilter !== 'all' && s.payment_method !== methodFilter) return false;
      if (eventFilter !== 'all' && eventForDate(events, s.sale_date)?.id !== eventFilter) return false;
      if (typeFilter !== 'all') {
        const piece = pieceById.get(s.piece_id);
        if (!piece || piece.type !== typeFilter) return false;
      }
      return true;
    });
  }, [sales, dateRange, customFrom, customTo, methodFilter, typeFilter, eventFilter, events, pieceById]);

  // Refunded sales stay in the filtered list/count for the audit trail
  // (staff can still see what happened), but shouldn't count toward
  // gross/net/by-type — the money isn't actually the store's anymore.
  const activeFiltered = useMemo(() => filtered.filter((s) => !s.refunded_at), [filtered]);

  const summary = useMemo(() => {
    const gross = activeFiltered.reduce((sum, s) => sum + s.sale_price, 0);
    const fees = activeFiltered.reduce((sum, s) => sum + s.fee_amount, 0);
    const tips = activeFiltered.reduce((sum, s) => sum + (s.tip_amount ?? 0), 0);
    return { gross, fees, tips, net: gross - fees, count: activeFiltered.length };
  }, [activeFiltered]);

  const byType = useMemo(() => {
    const map = new Map<string, { count: number; gross: number }>();
    for (const s of activeFiltered) {
      const type = pieceById.get(s.piece_id)?.type ?? 'unknown';
      const entry = map.get(type) ?? { count: 0, gross: 0 };
      entry.count += 1;
      entry.gross += s.sale_price;
      map.set(type, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].gross - a[1].gross);
  }, [activeFiltered, pieceById]);

  // Charts are drawn from the same refund-free list as the summary, so
  // their bars always add up to the "Gross sales" figure above them.
  const charts = useMemo(() => {
    const titleOf = (s: Sale) => pieceById.get(s.piece_id)?.title ?? 'Unknown item';
    return {
      overTime: salesOverTime(activeFiltered),
      byEvent: salesGroupedBy(activeFiltered, (s) => eventForDate(events, s.sale_date)?.name ?? 'No event'),
      byType: salesGroupedBy(activeFiltered, (s) => typeLabel(pieceById.get(s.piece_id)?.type ?? 'unknown')),
      byMethod: salesGroupedBy(activeFiltered, (s) => paymentMethodLabel(s.payment_method)),
      topItems: salesGroupedBy(activeFiltered, titleOf, 5),
      itemCount: new Set(activeFiltered.map(titleOf)).size,
    };
  }, [activeFiltered, events, pieceById]);

  async function handleRefund(sale: Sale) {
    try {
      const result = await refundSale(sale);
      applySaleUpdate(result.sale);
      if (result.piece) applyPieceUpdates([result.piece]);
    } catch (err) {
      appAlert('Refund failed', err instanceof Error ? err.message : 'Could not refund this sale.');
    }
  }

  async function handleSaveReport(title: string, notes: string) {
    const bounds = resolveDateRangeBounds(dateRange, customFrom, customTo);
    const snapshot: ReportSnapshot = {
      summary,
      byType: byType.map(([type, stats]) => ({ type, ...stats })),
      sales: activeFiltered.map((s) => ({
        id: s.id,
        title: pieceById.get(s.piece_id)?.title ?? 'Unknown item',
        sale_price: s.sale_price,
        tip_amount: s.tip_amount,
        payment_method: s.payment_method,
        sale_date: s.sale_date,
        refunded_at: s.refunded_at,
      })),
    };
    await addSavedReport({
      title,
      notes: notes.trim() || null,
      event_name: eventFilter !== 'all' ? eventById.get(eventFilter)?.name ?? null : null,
      from_date: bounds.from,
      to_date: bounds.to,
      snapshot: snapshot as unknown as Record<string, unknown>,
    });
  }

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
    <>
    <FlatList
      style={styles.list}
      contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}
      data={filtered}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => (
        <SaleRow
          sale={item}
          title={pieceById.get(item.piece_id)?.title ?? 'Unknown item'}
          eventName={eventForDate(events, item.sale_date)?.name ?? item.location}
          onRefund={handleRefund}
        />
      )}
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
                <Text style={[styles.chipText, methodFilter === m && styles.chipTextSelected]}>
                  {paymentMethodLabel(m)}
                </Text>
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
                <Text style={[styles.chipText, typeFilter === t && styles.chipTextSelected]}>{typeLabel(t)}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.eventsHeader}>
            <Text style={styles.filterLabel}>Event</Text>
            <Pressable style={styles.eventsLink} onPress={onManageEvents} hitSlop={8}>
              <Text style={styles.eventsLinkText}>Manage Events</Text>
            </Pressable>
          </View>
          {events.length === 0 && (
            <Text style={styles.eventsEmpty}>No events yet. Add an art fair or market to see its sales on their own.</Text>
          )}
          {events.length > 0 && (
            <>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, eventFilter === 'all' && styles.chipSelected]}
                  onPress={() => setEventFilter('all')}
                >
                  <Text style={[styles.chipText, eventFilter === 'all' && styles.chipTextSelected]}>All</Text>
                </Pressable>
                {events.map((e) => (
                  <Pressable
                    key={e.id}
                    style={[styles.chip, eventFilter === e.id && styles.chipSelected]}
                    onPress={() => setEventFilter(e.id)}
                  >
                    <Text style={[styles.chipText, eventFilter === e.id && styles.chipTextSelected]}>{e.name}</Text>
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

          <TimeBarChart title={charts.overTime.title} bars={charts.overTime.bars} />
          {/* A comparison needs at least two things to compare — with one
              event, method or item the bar would only repeat the summary. */}
          {charts.byEvent.length > 1 && <RankedBarChart title="By event" bars={charts.byEvent} />}
          <RankedBarChart title="By type" bars={charts.byType} />
          {charts.byMethod.length > 1 && <RankedBarChart title="By payment method" bars={charts.byMethod} />}
          {charts.itemCount > 1 && <RankedBarChart title="Top items" bars={charts.topItems} />}

          <Pressable style={styles.saveReportButton} onPress={() => setSaveModalOpen(true)}>
            <Text style={styles.saveReportButtonText}>Save this report</Text>
          </Pressable>

          <Text style={styles.filterLabel}>Sales ({filtered.length})</Text>
        </View>
      }
    />
    <SaveReportModal visible={saveModalOpen} onClose={() => setSaveModalOpen(false)} onSave={handleSaveReport} />
    </>
  );
}

function SaveReportModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (title: string, notes: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setTitle('');
    setNotes('');
  }

  async function handleSave() {
    if (!title.trim()) return appAlert('Missing title', 'Give this report a title.');
    setSubmitting(true);
    try {
      await onSave(title.trim(), notes);
      reset();
      onClose();
    } catch (err) {
      appAlert('Save failed', err instanceof Error ? err.message : 'Could not save this report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppModal
      visible={visible}
      transparent
      onRequestClose={() => {
        reset();
        onClose();
      }}
    >
      <View style={styles.saveModalBackdrop}>
        <View style={styles.saveModalCard}>
          <Text style={styles.saveModalHeading}>Save This Report</Text>
          <Text style={styles.filterLabel}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder='e.g. "Fall Festival 2026"'
            autoFocus
            onSubmitEditing={handleSave}
          />
          <Text style={styles.filterLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.saveModalNotes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="How'd it go? Anything worth remembering for next time?"
            multiline
          />
          <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
          </Pressable>
          <Pressable
            disabled={submitting}
            onPress={() => {
              reset();
              onClose();
            }}
          >
            <Text style={styles.cancelLink}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
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

function SaleRow({
  sale,
  title,
  eventName,
  onRefund,
}: {
  sale: Sale;
  title: string;
  eventName: string | null;
  onRefund: (sale: Sale) => Promise<void>;
}) {
  const [refunding, setRefunding] = useState(false);
  const refunded = !!sale.refunded_at;

  function confirmRefund() {
    appAlert(
      'Refund this sale?',
      `${title} — $${sale.sale_price.toFixed(2)} via ${paymentMethodLabel(sale.payment_method)}. This puts the item back in stock. Can't be undone from here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Refund',
          style: 'destructive',
          onPress: () => {
            setRefunding(true);
            onRefund(sale).finally(() => setRefunding(false));
          },
        },
      ]
    );
  }

  return (
    <View style={styles.saleRow}>
      <View style={styles.saleInfo}>
        <Text style={[styles.saleTitle, refunded && styles.refundedText]}>{title}</Text>
        <Text style={styles.saleMeta}>
          {new Date(sale.sale_date).toLocaleString()} · {paymentMethodLabel(sale.payment_method)}
          {eventName ? ` · ${eventName}` : ''}
        </Text>
        {refunded && (
          <Text style={styles.refundedBadge}>Refunded {new Date(sale.refunded_at!).toLocaleDateString()}</Text>
        )}
      </View>
      <View style={styles.saleAmounts}>
        <Text style={[styles.salePrice, refunded && styles.refundedText]}>${sale.sale_price.toFixed(2)}</Text>
        {sale.tip_amount ? <Text style={styles.saleTip}>+${sale.tip_amount.toFixed(2)} tip</Text> : null}
        {!refunded && (
          <Pressable disabled={refunding} onPress={confirmRefund} style={styles.refundButton}>
            <Text style={styles.refundLink}>{refunding ? 'Refunding…' : 'Refund'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const ADJUSTMENT_TYPES: AdjustmentType[] = ['loss', 'donation'];

function AdjustmentsReport() {
  const { adjustments, loading, error } = useAdjustments();
  const { pieces } = usePieces();

  const { isDemo } = useAuth();
  // Same reason as SalesReport: the demo store's entries are all in the past.
  const [dateRange, setDateRange] = useState<DateRange>(isDemo ? 'all' : 'today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<AdjustmentType | 'all'>('all');
  const { isTabletUp } = useBreakpoint();

  const pieceById = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);

  const filtered = useMemo(() => {
    return adjustments.filter((a) => {
      if (!isWithinRange(a.adjustment_date, dateRange, customFrom, customTo)) return false;
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      return true;
    });
  }, [adjustments, dateRange, customFrom, customTo, typeFilter]);

  const summary = useMemo(() => {
    const lossQty = filtered.filter((a) => a.type === 'loss').reduce((sum, a) => sum + a.quantity, 0);
    const donationQty = filtered.filter((a) => a.type === 'donation').reduce((sum, a) => sum + a.quantity, 0);
    return { lossQty, donationQty, count: filtered.length };
  }, [filtered]);

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
        <Text style={styles.errorText}>Couldn't load adjustments: {error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}
      data={filtered}
      keyExtractor={(a) => a.id}
      renderItem={({ item }) => (
        <AdjustmentRow adjustment={item} title={pieceById.get(item.piece_id)?.title ?? 'Unknown item'} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<Text style={styles.emptyText}>No losses or donations logged for these filters.</Text>}
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

          <Text style={styles.filterLabel}>Type</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, typeFilter === 'all' && styles.chipSelected]}
              onPress={() => setTypeFilter('all')}
            >
              <Text style={[styles.chipText, typeFilter === 'all' && styles.chipTextSelected]}>All</Text>
            </Pressable>
            {ADJUSTMENT_TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, typeFilter === t && styles.chipSelected]}
                onPress={() => setTypeFilter(t)}
              >
                <Text style={[styles.chipText, typeFilter === t && styles.chipTextSelected]}>
                  {t === 'loss' ? 'Loss' : 'Donation'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.summaryBox}>
            <SummaryRow label="Entries" value={summary.count} isCount />
            <SummaryRow label="Units lost" value={summary.lossQty} isCount />
            <SummaryRow label="Units donated" value={summary.donationQty} isCount />
          </View>

          <Text style={styles.filterLabel}>Logged ({filtered.length})</Text>
        </View>
      }
    />
  );
}

function AdjustmentRow({ adjustment, title }: { adjustment: InventoryAdjustment; title: string }) {
  return (
    <View style={styles.saleRow}>
      <View style={styles.saleInfo}>
        <Text style={styles.saleTitle}>{title}</Text>
        <Text style={styles.saleMeta}>
          {new Date(adjustment.adjustment_date).toLocaleString()}
          {adjustment.reason ? ` · ${adjustment.reason}` : ''}
        </Text>
      </View>
      <View style={styles.saleAmounts}>
        <Text style={[styles.salePrice, adjustment.type === 'loss' ? styles.lossBadge : styles.donationBadge]}>
          {adjustment.type === 'loss' ? 'Loss' : 'Donation'}
        </Text>
        <Text style={styles.saleMeta}>× {adjustment.quantity}</Text>
      </View>
    </View>
  );
}

function SavedReportsView() {
  const { savedReports, loading, error, deleteSavedReport } = useSavedReports();
  const [selected, setSelected] = useState<SavedReport | null>(null);
  const { isTabletUp } = useBreakpoint();

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
        <Text style={styles.errorText}>Couldn't load saved reports: {error}</Text>
      </View>
    );
  }

  function handleDelete(report: SavedReport) {
    appAlert('Delete this saved report?', report.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteSavedReport(report.id);
          setSelected(null);
        },
      },
    ]);
  }

  return (
    <>
      {savedReports.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            No saved reports yet — run a Sales report below and tap "Save this report".
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={centeredColumn(isTabletUp, CONTENT_WIDTH.wide)}
          data={savedReports}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => {
            const snapshot = item.snapshot as unknown as ReportSnapshot;
            return (
              <Pressable style={styles.saleRow} onPress={() => setSelected(item)}>
                <View style={styles.saleInfo}>
                  <Text style={styles.saleTitle}>{item.title}</Text>
                  <Text style={styles.saleMeta}>
                    {new Date(item.created_at).toLocaleDateString()}
                    {item.event_name ? ` · ${item.event_name}` : ''}
                    {item.from_date
                      ? ` · ${item.from_date}${item.to_date && item.to_date !== item.from_date ? ` – ${item.to_date}` : ''}`
                      : ''}
                  </Text>
                </View>
                <Text style={styles.salePrice}>${snapshot.summary.net.toFixed(2)}</Text>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <AppModal visible={!!selected} onRequestClose={() => setSelected(null)}>
        {selected && (
          <SavedReportDetail
            report={selected}
            onClose={() => setSelected(null)}
            onDelete={() => handleDelete(selected)}
          />
        )}
      </AppModal>
    </>
  );
}

function SavedReportDetail({
  report,
  onClose,
  onDelete,
}: {
  report: SavedReport;
  onClose: () => void;
  onDelete: () => void;
}) {
  const snapshot = report.snapshot as unknown as ReportSnapshot;
  const { isTabletUp } = useBreakpoint();

  return (
    <View style={styles.screen}>
      <View style={styles.savedDetailHeader}>
        <Text style={styles.savedDetailHeading}>{report.title}</Text>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.filters, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        <Text style={styles.filterLabel}>
          Saved {new Date(report.created_at).toLocaleDateString()}
          {report.event_name ? ` · ${report.event_name}` : ''}
          {report.from_date
            ? ` · ${report.from_date}${report.to_date && report.to_date !== report.from_date ? ` – ${report.to_date}` : ''}`
            : ''}
        </Text>
        {report.notes && <Text style={styles.savedNotes}>{report.notes}</Text>}

        <View style={styles.summaryBox}>
          <SummaryRow label="Items sold" value={snapshot.summary.count} isCount />
          <SummaryRow label="Gross sales" value={snapshot.summary.gross} />
          <SummaryRow label="Tips collected" value={snapshot.summary.tips} />
          <SummaryRow label="Fees deducted" value={-snapshot.summary.fees} muted />
          <SummaryRow label="Net revenue" value={snapshot.summary.net} bold />
        </View>

        {snapshot.byType.length > 0 && (
          <View style={styles.summaryBox}>
            <Text style={styles.filterLabel}>By type</Text>
            {snapshot.byType.map((t) => (
              <View key={t.type} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {typeLabel(t.type)} ({t.count})
                </Text>
                <Text style={styles.summaryValue}>${t.gross.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.filterLabel}>Sales ({snapshot.sales.length})</Text>
        {snapshot.sales.map((s) => (
          <View key={s.id} style={styles.saleRow}>
            <View style={styles.saleInfo}>
              <Text style={[styles.saleTitle, s.refunded_at && styles.refundedText]}>{s.title}</Text>
              <Text style={styles.saleMeta}>
                {new Date(s.sale_date).toLocaleString()} · {paymentMethodLabel(s.payment_method)}
              </Text>
              {s.refunded_at && <Text style={styles.refundedBadge}>Refunded</Text>}
            </View>
            <View style={styles.saleAmounts}>
              <Text style={[styles.salePrice, s.refunded_at && styles.refundedText]}>
                ${s.sale_price.toFixed(2)}
              </Text>
              {s.tip_amount ? <Text style={styles.saleTip}>+${s.tip_amount.toFixed(2)} tip</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.savedDetailFooter}>
        <Pressable onPress={onDelete}>
          <Text style={styles.deleteText}>Delete saved report</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  viewToggleRow: { alignItems: 'center', padding: 16, paddingBottom: 0 },
  // One pill holding the three tabs, centered and in the accent color so
  // it reads as "which report" rather than as another row of filters.
  viewToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
  },
  viewChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9 },
  viewChipSelected: { backgroundColor: colors.accent },
  viewChipText: { fontWeight: '700', fontSize: 14, color: colors.accent },
  viewChipTextSelected: { color: '#fff' },
  list: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#b00020', textAlign: 'center' },
  emptyText: { color: '#666', textAlign: 'center', padding: 24 },
  filters: { padding: 16 },
  filterLabel: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.chip },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.ink },
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
  summaryBox: { marginTop: 20, padding: 16, backgroundColor: colors.card, borderRadius: 10, gap: 6 },
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
  refundedText: { color: '#999', textDecorationLine: 'line-through' },
  refundedBadge: { fontSize: 12, color: '#b00020', marginTop: 2, fontWeight: '600' },
  refundButton: { marginTop: 6 },
  refundLink: { fontSize: 12, color: '#b00020', fontWeight: '600', textDecorationLine: 'underline' },
  lossBadge: { color: '#b00020' },
  donationBadge: { color: '#2a7a2a' },
  separator: { height: 1, backgroundColor: '#eee', marginLeft: 16 },
  eventsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eventsLink: { marginBottom: 8 },
  eventsEmpty: { fontSize: 13, color: '#888' },
  eventsLinkText: { color: colors.primary, fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' },
  saveReportButton: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveReportButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  saveModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  saveModalCard: { backgroundColor: colors.background, borderRadius: 12, padding: 20, width: '100%', maxWidth: 420 },
  saveModalHeading: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  saveModalNotes: { minHeight: 70, textAlignVertical: 'top' },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelLink: { textAlign: 'center', color: '#666', marginTop: 12 },
  savedDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  savedDetailHeading: { fontSize: 17, fontWeight: '700' },
  closeText: { fontSize: 18, color: '#666', paddingHorizontal: 4 },
  savedNotes: { fontSize: 14, color: '#444', marginTop: 8, fontStyle: 'italic' },
  savedDetailFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  deleteText: { textAlign: 'center', color: '#b00020', fontWeight: '600' },
});
