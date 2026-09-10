import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCart, effectivePrice } from '../context/CartContext';
import { usePieces } from '../context/PiecesContext';
import { useSales } from '../context/SalesContext';
import { useDeals } from '../context/DealsContext';
import { useAuth } from '../context/AuthContext';
import { evaluateDeals } from '../lib/deals';
import { calculateFee } from '../lib/fees';
import { venmoPayUrl, paypalPayUrl, renderQrDataUrl } from '../lib/payLinks';
import { createStripeCheckout, checkStripeCheckoutStatus } from '../lib/payments';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { appAlert } from '../lib/alert';
import { supabase } from '../lib/supabase';
import { PaymentMethod, Sale } from '../types/database';

type NewSale = Omit<Sale, 'id' | 'store_id' | 'refunded_at' | 'refund_reason'>;
type Step = 'staffSetup' | 'buyerReview' | 'buyerTip' | 'buyerMethod' | 'confirm';

// Cancel steps backward one screen at a time (confirm → method → tip →
// review → setup) rather than always exiting — except at whichever step
// this particular checkout session actually started on (staffSetup for the
// staff-initiated flow, buyerTip for the buyer's own "Confirm Cart"), where
// there's nothing to step back to, so Cancel there really does exit.
const STEP_ORDER: Step[] = ['staffSetup', 'buyerReview', 'buyerTip', 'buyerMethod', 'confirm'];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Card',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cash_app: 'Cash App Pay',
  cash: 'Cash',
};

// Card and Cash App Pay are both real Stripe payment method types on the
// vendor's connected account, so both get an auto-polled, auto-confirmed QR
// step. Venmo/PayPal/cash stay self-reported — PayPal can't go through
// Stripe for this app's US/Connect-platform setup (see fees.ts), and Venmo
// has no API for this at all.
const STRIPE_METHODS: PaymentMethod[] = ['card', 'cash_app'];

const TIP_PRESETS = [0.15, 0.2, 0.25];

// How often to ask Stripe whether the buyer has paid yet, once the QR is up.
const CARD_POLL_INTERVAL_MS = 2000;

export default function CheckoutScreen({
  onClose,
  initialStep = 'staffSetup',
}: {
  onClose: () => void;
  // Customer View's own "Confirm Cart" button jumps straight to 'buyerTip' —
  // the live cart the buyer's already looking at stands in for the
  // 'buyerReview' step, and 'staffSetup' (the optional show/venue field)
  // doesn't apply when the buyer starts checkout themselves.
  initialStep?: Step;
}) {
  const { items, subtotal, clear, location, setLocation } = useCart();
  const { applyPieceUpdates } = usePieces();
  const { applySales } = useSales();
  const { deals } = useDeals();
  const { store } = useAuth();
  const enabledMethods = store?.enabled_payment_methods ?? [];
  const { isTabletUp } = useBreakpoint();

  const [step, setStep] = useState<Step>(initialStep);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [tipText, setTipText] = useState('');
  const [customTipText, setCustomTipText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Confirm-step state — QR for Stripe/Venmo/PayPal, or nothing for cash.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [cardPaid, setCardPaid] = useState(false);
  // Venmo/PayPal only: buyer taps "Done, I've paid" before the screen asks
  // for the device back — until then they're still looking at their QR.
  const [buyerDone, setBuyerDone] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A ref, not state: pollCardStatus's own promise chain needs this to stay
  // current across overlapping ticks (a slow network response can leave two
  // in flight at once, both independently seeing 'paid' — clearInterval only
  // stops *future* ticks, not one already awaiting a response), and state
  // read inside an async callback risks a stale closure anyway.
  const finalizingRef = useRef(false);

  const dealsResult = useMemo(() => evaluateDeals(items, deals), [items, deals]);
  const effectiveSubtotal = subtotal - dealsResult.totalDiscount;

  const tipAmount = parseFloat(tipText) || 0;
  const fee = useMemo(
    () => (method ? calculateFee(effectiveSubtotal, method, store?.fee_overrides) : 0),
    [effectiveSubtotal, method, store?.fee_overrides]
  );
  const passFeeToBuyer = store?.pass_fee_to_buyer ?? false;
  const buyerTotal = effectiveSubtotal + tipAmount + (passFeeToBuyer ? fee : 0);
  const netRevenue = effectiveSubtotal - (passFeeToBuyer ? 0 : fee);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  // amountsFor/feeFor let handleSelectMethod use the *just-picked* method
  // immediately, instead of racing the setMethod() state update that won't
  // have landed yet in this same synchronous handler.
  function feeFor(m: PaymentMethod) {
    return calculateFee(effectiveSubtotal, m, store?.fee_overrides);
  }
  function buyerTotalFor(m: PaymentMethod) {
    const f = feeFor(m);
    return effectiveSubtotal + tipAmount + (passFeeToBuyer ? f : 0);
  }

  async function finalizeSale(actualFee: number, processorPaymentId: string | null, m: PaymentMethod) {
    const newSales: NewSale[] = [];

    items.forEach((item, itemIndex) => {
      const itemDiscount = dealsResult.discountByPieceId.get(item.piece.id) ?? 0;
      const perUnitDiscount = itemDiscount / item.quantity;
      const unitPrice = Math.max(0, effectivePrice(item) - perUnitDiscount);

      const apportionedFee =
        effectiveSubtotal > 0
          ? Math.round(((unitPrice * item.quantity) / effectiveSubtotal) * actualFee * 100) / 100
          : 0;
      const perUnitFee = Math.round((apportionedFee / item.quantity) * 100) / 100;

      for (let i = 0; i < item.quantity; i++) {
        newSales.push({
          piece_id: item.piece.id,
          sale_price: Math.round(unitPrice * 100) / 100,
          tip_amount: itemIndex === 0 && i === 0 ? tipAmount : null,
          payment_method: m,
          fee_amount: perUnitFee,
          sale_date: new Date().toISOString(),
          processor_payment_id: itemIndex === 0 && i === 0 ? processorPaymentId : null,
          location: location.trim() || null,
        });
      }
    });

    setSubmitting(true);
    try {
      // CartContext already re-syncs its quantity caps against this
      // device's own PiecesContext, but that can't see a sale that just
      // happened on a *different* device — so re-check live stock right
      // before charging/recording anything, the last moment it actually
      // matters. finalize_sale's own server-side clamp keeps quantity_
      // remaining from ever going negative either way, but without this
      // the sale would still get recorded (and the buyer charged) for more
      // than what's actually in stock, with nothing telling staff that
      // happened.
      const requiredByPiece = new Map<string, number>();
      items.forEach((item) => {
        requiredByPiece.set(item.piece.id, (requiredByPiece.get(item.piece.id) ?? 0) + item.quantity);
      });
      const { data: liveStock, error: stockError } = await supabase
        .from('pieces')
        .select('id, title, quantity_remaining')
        .in('id', Array.from(requiredByPiece.keys()));
      if (stockError) throw stockError;
      const shortfalls = (liveStock ?? [])
        .filter((p) => (requiredByPiece.get(p.id) ?? 0) > p.quantity_remaining)
        .map((p) => `${p.title} (${p.quantity_remaining} left, ${requiredByPiece.get(p.id)} in cart)`);
      if (shortfalls.length > 0) {
        throw new Error(
          `Stock changed since this was added to the cart — ${shortfalls.join('; ')}. Go back and adjust the cart.`
        );
      }

      // One DB transaction for both the inventory decrement and the sale
      // insert — see supabase/migrations/0005_atomic_finalize_sale.sql.
      // Previously these were two separate round trips with no rollback,
      // so a failure between them could lose stock with no matching sale.
      const { data, error } = await supabase.rpc('finalize_sale', { sale_rows: newSales });
      if (error) throw error;
      applyPieceUpdates(data.pieces);
      applySales(data.sales);
      const total = effectiveSubtotal + tipAmount + (passFeeToBuyer ? actualFee : 0);
      const net = effectiveSubtotal - (passFeeToBuyer ? 0 : actualFee);
      clear();
      onClose();
      appAlert(
        'Sale recorded',
        `Charged $${total.toFixed(2)} via ${METHOD_LABELS[m]}.\nNet after fees: $${net.toFixed(2)}`
      );
    } catch (err) {
      appAlert(
        'Checkout failed',
        err instanceof Error ? err.message : 'Could not save this sale — check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function selectTipPreset(pct: number) {
    setTipText((effectiveSubtotal * pct).toFixed(2));
    setStep('buyerMethod');
  }

  function selectNoTip() {
    setTipText('');
    setStep('buyerMethod');
  }

  function confirmCustomTip() {
    setTipText(customTipText);
    setStep('buyerMethod');
  }

  async function handleSelectMethod(selected: PaymentMethod) {
    setMethod(selected);
    setStep('confirm');
    setBuyerDone(false);
    setQrDataUrl(null);
    setQrError(null);
    setCardPaid(false);
    finalizingRef.current = false;

    if (selected === 'cash') return; // nothing to generate — the render branch handles cash directly

    setQrLoading(true);
    try {
      if (STRIPE_METHODS.includes(selected)) {
        const idempotencyKey = crypto.randomUUID();
        const amountCents = Math.round(buyerTotalFor(selected) * 100);
        const { url, sessionId } = await createStripeCheckout(
          amountCents,
          idempotencyKey,
          selected === 'cash_app' ? 'cashapp' : 'card'
        );
        setCheckoutSessionId(sessionId);
        setQrDataUrl(await renderQrDataUrl(url));
        pollTimer.current = setInterval(() => pollCardStatus(sessionId, selected), CARD_POLL_INTERVAL_MS);
      } else if (selected === 'venmo' && store?.venmo_username) {
        const url = venmoPayUrl(store.venmo_username, buyerTotalFor(selected), `${store.name} purchase`);
        setQrDataUrl(await renderQrDataUrl(url));
      } else if (selected === 'paypal' && store?.paypal_me_username) {
        const url = paypalPayUrl(store.paypal_me_username, buyerTotalFor(selected));
        setQrDataUrl(await renderQrDataUrl(url));
      } else {
        setQrError('This payment method is missing its handle — set it up in Admin > Settings > Payment Methods.');
      }
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Could not start this payment — please try again.');
    } finally {
      setQrLoading(false);
    }
  }

  async function pollCardStatus(sessionId: string, m: PaymentMethod) {
    try {
      const status = await checkStripeCheckoutStatus(sessionId);
      // A slow network response can leave two ticks in flight at once —
      // clearInterval below only stops *future* ticks, so without this
      // guard both could independently see 'paid' and double-record the
      // same charge. finalizingRef (not state) so a stale closure can't
      // slip past it.
      if (status.paymentStatus === 'paid' && !finalizingRef.current) {
        finalizingRef.current = true;
        if (pollTimer.current) clearInterval(pollTimer.current);
        setCardPaid(true);
        const realFee = status.feeAmountCents != null ? status.feeAmountCents / 100 : feeFor(m);
        await finalizeSale(realFee, status.paymentIntentId, m);
      }
    } catch {
      // A transient poll failure isn't fatal — just try again next tick.
    }
  }

  function handleCancel() {
    if (pollTimer.current) clearInterval(pollTimer.current);

    const currentIndex = STEP_ORDER.indexOf(step);
    const startIndex = STEP_ORDER.indexOf(initialStep);
    if (currentIndex <= startIndex) {
      onClose();
      return;
    }

    // Stepping back out of 'confirm' — clear its QR/poll state so the
    // payment-method list (or whatever's next) doesn't briefly show stale
    // data if the buyer picks the same method again.
    if (step === 'confirm') {
      setMethod(null);
      setQrDataUrl(null);
      setQrError(null);
      setCheckoutSessionId(null);
      setCardPaid(false);
      setBuyerDone(false);
      finalizingRef.current = false;
    }

    setStep(STEP_ORDER[currentIndex - 1]);
  }

  // ---- staff setup ----
  if (step === 'staffSetup') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
          <Text style={styles.heading}>Checkout</Text>
          <Text style={styles.sectionLabel}>Show / venue (optional, for reports)</Text>
          <TextInput
            style={styles.tipInput}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Bemidji Farmers Market"
          />
          {enabledMethods.length === 0 && (
            <Text style={styles.error}>No payment methods enabled — set some up in Admin &gt; Settings &gt; Payment Methods.</Text>
          )}
        </ScrollView>
        <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
          <Pressable
            style={[styles.confirmButton, isTabletUp && styles.confirmButtonTabletUp, enabledMethods.length === 0 && styles.confirmButtonDisabled]}
            disabled={enabledMethods.length === 0}
            onPress={() => setStep('buyerReview')}
          >
            <Text style={[styles.confirmButtonText, isTabletUp && styles.confirmButtonTextTabletUp]}>Continue →</Text>
          </Pressable>
          <Pressable onPress={handleCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- buyer: review cart ----
  if (step === 'buyerReview') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
          <Text style={[styles.heading, isTabletUp && styles.headingTabletUp]}>Your order</Text>
          {items.map((item) => (
            <View key={item.piece.id} style={styles.reviewRow}>
              <Text style={styles.reviewItemName}>
                {item.piece.title}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              </Text>
              <Text style={styles.reviewItemPrice}>${(effectivePrice(item) * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
          {dealsResult.applied.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Deals applied</Text>
              {dealsResult.applied.map((a) => (
                <Text key={a.deal.id} style={styles.dealApplied}>
                  ✓ {a.description}
                </Text>
              ))}
            </>
          )}
          <View style={styles.summary}>
            <SummaryRow label="Subtotal" value={subtotal} bold />
          </View>
        </ScrollView>
        <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
          <Pressable style={[styles.confirmButton, isTabletUp && styles.confirmButtonTabletUp]} onPress={() => setStep('buyerTip')}>
            <Text style={[styles.confirmButtonText, isTabletUp && styles.confirmButtonTextTabletUp]}>Confirm & Continue</Text>
          </Pressable>
          <Pressable onPress={handleCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- buyer: tip ----
  if (step === 'buyerTip') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
          <Text style={[styles.heading, isTabletUp && styles.headingTabletUp]}>Add a tip?</Text>
          <View style={styles.tipPresetRow}>
            {TIP_PRESETS.map((pct) => (
              <Pressable
                key={pct}
                style={[styles.tipPresetButton, isTabletUp && styles.tipPresetButtonTabletUp]}
                onPress={() => selectTipPreset(pct)}
              >
                <Text style={styles.tipPresetPercent}>{Math.round(pct * 100)}%</Text>
                <Text style={styles.tipPresetAmount}>${(effectiveSubtotal * pct).toFixed(2)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.noTipButton} onPress={selectNoTip}>
            <Text style={styles.noTipButtonText}>No tip</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>Or enter a custom amount</Text>
          <TextInput
            style={styles.tipInput}
            value={customTipText}
            onChangeText={setCustomTipText}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <Pressable
            style={[styles.confirmButton, isTabletUp && styles.confirmButtonTabletUp, !customTipText.trim() && styles.confirmButtonDisabled]}
            disabled={!customTipText.trim()}
            onPress={confirmCustomTip}
          >
            <Text style={[styles.confirmButtonText, isTabletUp && styles.confirmButtonTextTabletUp]}>Continue</Text>
          </Pressable>
        </ScrollView>
        <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
          <Pressable onPress={handleCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- buyer: choose payment method ----
  if (step === 'buyerMethod') {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
          <Text style={styles.totalPreviewLabel}>Total</Text>
          <Text style={[styles.totalPreview, isTabletUp && styles.totalPreviewTabletUp]}>
            ${(effectiveSubtotal + tipAmount).toFixed(2)}
          </Text>
          <Text style={[styles.heading, isTabletUp && styles.headingTabletUp]}>How would you like to pay?</Text>
          <View style={styles.methodList}>
            {enabledMethods.map((m) => (
              <Pressable
                key={m}
                style={[styles.methodCard, isTabletUp && styles.methodCardTabletUp]}
                onPress={() => handleSelectMethod(m)}
              >
                <Text style={styles.methodCardText}>{METHOD_LABELS[m]}</Text>
                <Text style={styles.methodCardAmount}>${buyerTotalFor(m).toFixed(2)}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
          <Pressable onPress={handleCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- confirm: QR / cash, then hand back to staff ----
  const showHandBackToStaff = method === 'cash' || ((method === 'venmo' || method === 'paypal') && buyerDone);

  const qrSize = isTabletUp ? 320 : 240;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.qrScroll, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        {showHandBackToStaff ? (
          <>
            <Text style={[styles.heading, isTabletUp && styles.headingTabletUp]}>Please hand the device back to staff</Text>
            <Text style={styles.qrMethodLabel}>
              {method ? METHOD_LABELS[method] : ''} — ${buyerTotal.toFixed(2)}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.heading, isTabletUp && styles.headingTabletUp]}>Please scan this QR code to pay</Text>
            <Text style={styles.qrMethodLabel}>
              {method ? METHOD_LABELS[method] : ''} — ${buyerTotal.toFixed(2)}
            </Text>

            {qrLoading && <ActivityIndicator size="large" style={{ marginTop: 40 }} />}
            {qrError && <Text style={styles.error}>{qrError}</Text>}
            {qrDataUrl && (
              <Image source={{ uri: qrDataUrl }} style={[styles.qrImage, { width: qrSize, height: qrSize }]} resizeMode="contain" />
            )}

            {method && STRIPE_METHODS.includes(method) ? (
              <Text style={styles.qrHint}>
                {cardPaid ? 'Payment received — recording sale…' : 'Waiting for payment…'}
              </Text>
            ) : (
              <Text style={styles.qrHint}>Scan the code and pay in your {method ? METHOD_LABELS[method] : ''} app.</Text>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, centeredColumn(isTabletUp, CONTENT_WIDTH.wide)]}>
        {showHandBackToStaff && (
          <Pressable
            style={[styles.confirmButton, isTabletUp && styles.confirmButtonTabletUp, submitting && styles.confirmButtonDisabled]}
            disabled={submitting}
            onPress={() => method && finalizeSale(fee, null, method)}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.confirmButtonText, isTabletUp && styles.confirmButtonTextTabletUp]}>Confirm Paid</Text>
            )}
          </Pressable>
        )}
        {!showHandBackToStaff && (method === 'venmo' || method === 'paypal') && (
          <Pressable style={[styles.confirmButton, isTabletUp && styles.confirmButtonTabletUp]} onPress={() => setBuyerDone(true)}>
            <Text style={[styles.confirmButtonText, isTabletUp && styles.confirmButtonTextTabletUp]}>Done, I've paid</Text>
          </Pressable>
        )}
        <Pressable disabled={submitting} onPress={handleCancel}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, muted && styles.muted]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.bold, muted && styles.muted]}>
        {value < 0 ? '-' : ''}${Math.abs(value).toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 16 },
  qrScroll: { padding: 16, alignItems: 'center' },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  headingTabletUp: { fontSize: 24 },
  totalPreviewLabel: { fontSize: 13, color: '#666', textAlign: 'center' },
  totalPreview: { fontSize: 40, fontWeight: '800', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  totalPreviewTabletUp: { fontSize: 52 },
  sectionLabel: { fontSize: 13, color: '#666', marginTop: 16, marginBottom: 8 },
  tipInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  dealApplied: { color: '#2a7a2a', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  summary: { marginTop: 24, gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 15, color: '#333' },
  summaryValue: { fontSize: 15, color: '#333' },
  bold: { fontWeight: '700', fontSize: 17 },
  muted: { color: '#888' },
  error: { color: '#b00020', textAlign: 'center', marginTop: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  confirmButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonDisabled: { opacity: 0.6 },
  confirmButtonTabletUp: { paddingVertical: 18 },
  confirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  confirmButtonTextTabletUp: { fontSize: 18 },
  cancel: { textAlign: 'center', color: '#666' },
  qrMethodLabel: { fontSize: 16, fontWeight: '600', marginBottom: 24 },
  qrImage: { width: 280, height: 280, marginTop: 8 },
  qrHint: { marginTop: 24, fontSize: 14, color: '#666', textAlign: 'center', maxWidth: 300 },

  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  reviewItemName: { fontSize: 16, color: '#1a1a1a', flex: 1, paddingRight: 12 },
  reviewItemPrice: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },

  tipPresetRow: { flexDirection: 'row', gap: 10 },
  tipPresetButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingVertical: 18,
    alignItems: 'center',
  },
  tipPresetButtonTabletUp: { paddingVertical: 24 },
  tipPresetPercent: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  tipPresetAmount: { fontSize: 13, color: '#666', marginTop: 4 },
  noTipButton: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  noTipButtonText: { fontSize: 15, color: '#666', textDecorationLine: 'underline' },

  methodList: { gap: 10 },
  methodCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 18,
  },
  methodCardTabletUp: { paddingVertical: 26, paddingHorizontal: 24 },
  methodCardText: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  methodCardAmount: { fontSize: 16, fontWeight: '600', color: '#333' },
});
