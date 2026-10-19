import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { FeeRate, PaymentMethod } from '../types/database';
import { startStripeOnboarding, checkStripeAccountStatus, getStripeAccountBalance, StripeAccountBalance } from '../lib/payments';
import { feeRateFor } from '../lib/fees';
import { appAlert } from '../lib/alert';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';
import { colors } from '../lib/theme';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Credit/debit card',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cash_app: 'Cash App',
  cash: 'Cash',
};

// Methods in this order in the UI, matching how they'll appear at checkout.
const ALL_METHODS: PaymentMethod[] = ['card', 'venmo', 'paypal', 'cash_app', 'cash'];

// A rate is stored as a fraction (0.029) but shown as a percent (2.9) —
// multiplying by 100 reintroduces float noise (0.029 * 100 ===
// 2.9000000000000004), so round back to a sane number of decimal places
// before display.
function formatRatePercent(rate: number): string {
  return parseFloat((rate * 100).toFixed(4)).toString();
}

export default function PaymentSettingsScreen() {
  const { store, updateStore, refreshStore, isDemo } = useAuth();
  const [enabled, setEnabled] = useState<PaymentMethod[]>(store?.enabled_payment_methods ?? []);
  const [passFeeToBuyer, setPassFeeToBuyer] = useState(store?.pass_fee_to_buyer ?? false);
  const [venmoUsername, setVenmoUsername] = useState(store?.venmo_username ?? '');
  const [paypalUsername, setPaypalUsername] = useState(store?.paypal_me_username ?? '');
  const [showFeeOverrides, setShowFeeOverrides] = useState(false);
  // Blank means "use the app default for this method" — only a method the
  // vendor actually typed a value for ends up in fee_overrides on save.
  const [feeRateText, setFeeRateText] = useState<Record<PaymentMethod, string>>(() =>
    Object.fromEntries(
      ALL_METHODS.map((m) => [m, store?.fee_overrides?.[m] ? formatRatePercent(store.fee_overrides[m]!.rate) : ''])
    ) as Record<PaymentMethod, string>
  );
  const [feeFixedText, setFeeFixedText] = useState<Record<PaymentMethod, string>>(() =>
    Object.fromEntries(
      ALL_METHODS.map((m) => [m, store?.fee_overrides?.[m] ? String(store.fee_overrides[m]!.fixed) : ''])
    ) as Record<PaymentMethod, string>
  );
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [balance, setBalance] = useState<StripeAccountBalance | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const { isTabletUp } = useBreakpoint();

  useEffect(() => {
    // Re-check status once on mount in case Stripe onboarding just finished
    // (see App.tsx for the "stripe_return" handoff).
    handleRefreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMethod(method: PaymentMethod) {
    setEnabled((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  }

  async function handleRefreshStatus() {
    if (!store?.stripe_account_id) return;
    setCheckingStatus(true);
    try {
      await checkStripeAccountStatus();
      await refreshStore();
    } catch {
      // Silent — this is a background refresh; the Connect button/status
      // below still reflects last-known state either way.
    } finally {
      setCheckingStatus(false);
    }
    try {
      setBalance(await getStripeAccountBalance());
      setBalanceError(false);
    } catch {
      // Most likely cause: the platform's restricted key hasn't been
      // granted "Balance: Read" yet — surfaced in the UI rather than
      // silently hidden, since it needs a one-time dashboard fix.
      setBalanceError(true);
    }
  }

  async function handleConnectStripe() {
    if (Platform.OS !== 'web') {
      appAlert('Web only', 'Connect Stripe from the web app.');
      return;
    }
    if (isDemo) {
      appAlert(
        'Not available in the demo',
        "Connecting Stripe sets up a real payments account, so it's turned off in the shared demo store. Create your own account to accept card and Cash App Pay payments."
      );
      return;
    }
    setConnecting(true);
    try {
      // Stripe's hosted onboarding is a full-page redirect away and back —
      // since this app has no URL router, the vendor lands back on the
      // customer-facing screen after returning, not back in Settings. That's
      // a real but minor rough edge (Connect onboarding is a one-time setup
      // step, not part of the regular checkout flow): re-entering the staff
      // PIN and Settings picks the status back up correctly, since this
      // screen re-checks status on every mount (see the effect above).
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const url = await startStripeOnboarding(returnUrl, returnUrl);
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      // Stripe refuses to create live connected accounts until the
      // *platform's own* profile (business details, not any one vendor's)
      // is filled out in the Stripe dashboard — a one-time setup step, and
      // the raw error text already includes the exact dashboard link to
      // finish it. Surface that as an actionable button instead of just
      // dumping Stripe's sentence into a plain alert.
      const platformProfileUrl = /platform profile/i.test(message) ? message.match(/https?:\/\/\S+/)?.[0] : null;
      if (platformProfileUrl) {
        appAlert(
          'Finish setting up Stripe Connect',
          'Stripe needs a few more details about your business before vendors can connect their accounts — a one-time setup step.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Complete Setup', onPress: () => window.open(platformProfileUrl, '_blank') },
          ]
        );
      } else {
        appAlert('Could not start Stripe setup', message);
      }
      setConnecting(false);
    }
  }

  async function handleSave() {
    if (enabled.includes('card') && !store?.stripe_onboarding_complete) {
      appAlert('Finish connecting Stripe', 'Card can\'t be enabled until Stripe setup is complete.');
      return;
    }
    if (enabled.includes('venmo') && !venmoUsername.trim()) {
      return appAlert('Missing Venmo username', 'Enter the username to show a Venmo QR at checkout.');
    }
    if (enabled.includes('paypal') && !paypalUsername.trim()) {
      return appAlert('Missing PayPal.me username', 'Enter the username to show a PayPal QR at checkout.');
    }
    if (enabled.includes('cash_app') && !stripeReady) {
      return appAlert('Finish connecting Stripe', "Cash App Pay can't be enabled until Stripe setup is complete.");
    }

    const feeOverrides: Partial<Record<PaymentMethod, FeeRate>> = {};
    for (const m of ALL_METHODS) {
      const rateStr = feeRateText[m].trim();
      const fixedStr = feeFixedText[m].trim();
      if (!rateStr && !fixedStr) continue;
      const rate = rateStr ? parseFloat(rateStr) / 100 : feeRateFor(m).rate;
      const fixed = fixedStr ? parseFloat(fixedStr) : feeRateFor(m).fixed;
      if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(fixed) || fixed < 0) {
        return appAlert('Invalid fee rate', `Check the ${METHOD_LABELS[m]} fee rate — it should be a plain, non-negative number.`);
      }
      feeOverrides[m] = { rate, fixed };
    }

    setSubmitting(true);
    try {
      await updateStore({
        enabled_payment_methods: enabled,
        pass_fee_to_buyer: passFeeToBuyer,
        venmo_username: venmoUsername.trim() || null,
        paypal_me_username: paypalUsername.trim() || null,
        fee_overrides: feeOverrides,
      });
      appAlert('Saved', 'Payment settings updated.');
    } catch (err) {
      appAlert('Save failed', err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSubmitting(false);
    }
  }

  const stripeReady = !!store?.stripe_onboarding_complete;

  return (
    <ScrollView contentContainerStyle={[styles.scroll, centeredColumn(isTabletUp, CONTENT_WIDTH.narrow)]}>
      <Text style={styles.heading}>Payment Methods</Text>

      <Text style={styles.sectionLabel}>Card &amp; Cash App Pay (via Stripe)</Text>
      {stripeReady ? (
        <>
          <View style={styles.statusRow}>
            <Text style={styles.statusReady}>✓ Connected — ready to accept cards and Cash App Pay</Text>
            <Pressable onPress={handleRefreshStatus} disabled={checkingStatus}>
              <Text style={styles.link}>{checkingStatus ? 'Checking…' : 'Refresh'}</Text>
            </Pressable>
          </View>
          {balance ? (
            <View style={styles.balanceBox}>
              <Text style={styles.balanceLabel}>In Stripe, not yet paid out</Text>
              <Text style={styles.balanceValue}>
                ${((balance.availableCents + balance.pendingCents) / 100).toFixed(2)}
              </Text>
              <Text style={styles.balanceBreakdown}>
                ${(balance.availableCents / 100).toFixed(2)} available for next payout · $
                {(balance.pendingCents / 100).toFixed(2)} still clearing
              </Text>
            </View>
          ) : balanceError ? (
            <Text style={styles.helperText}>
              Could not load Stripe balance — the platform key may be missing Balance read access.
            </Text>
          ) : null}
        </>
      ) : (
        <View>
          <Text style={styles.helperText}>
            {store?.stripe_account_id
              ? "You've started connecting Stripe but haven't finished — pick up where you left off."
              : 'Connect a Stripe account to accept real card and Cash App Pay payments (buyer scans a QR, pays on their own phone).'}
          </Text>
          <Pressable style={[styles.connectButton, connecting && styles.disabled]} disabled={connecting} onPress={handleConnectStripe}>
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.connectButtonText}>
                {store?.stripe_account_id ? 'Continue Stripe setup' : 'Connect with Stripe'}
              </Text>
            )}
          </Pressable>
          {store?.stripe_account_id && (
            <Pressable onPress={handleRefreshStatus} disabled={checkingStatus} style={{ marginTop: 8 }}>
              <Text style={styles.link}>{checkingStatus ? 'Checking…' : 'Refresh status'}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Accepted payment methods</Text>
      <View style={styles.chipRow}>
        {ALL_METHODS.map((m) => {
          const disabled = (m === 'card' || m === 'cash_app') && !stripeReady;
          const selected = enabled.includes(m);
          return (
            <Pressable
              key={m}
              disabled={disabled}
              onPress={() => toggleMethod(m)}
              style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {METHOD_LABELS[m]}
                {disabled ? ' (connect Stripe first)' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {enabled.includes('venmo') && (
        <>
          <Text style={styles.label}>Venmo username</Text>
          <TextInput
            style={styles.input}
            value={venmoUsername}
            onChangeText={setVenmoUsername}
            placeholder="e.g. Four-Seasons-Studio"
            autoCapitalize="none"
            onSubmitEditing={handleSave}
          />
        </>
      )}
      {enabled.includes('paypal') && (
        <>
          <Text style={styles.label}>PayPal.me username</Text>
          <TextInput
            style={styles.input}
            value={paypalUsername}
            onChangeText={setPaypalUsername}
            placeholder="e.g. MFPStudios"
            autoCapitalize="none"
            onSubmitEditing={handleSave}
          />
        </>
      )}
      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Processing fees</Text>
      <Pressable style={styles.toggleRow} onPress={() => setPassFeeToBuyer((v) => !v)}>
        <View style={[styles.checkbox, passFeeToBuyer && styles.checkboxChecked]}>
          {passFeeToBuyer && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.toggleLabel}>Add Stripe's processing fee to the buyer's total (instead of it coming out of your payout)</Text>
      </Pressable>

      <Pressable style={{ marginTop: 14 }} onPress={() => setShowFeeOverrides((v) => !v)}>
        <Text style={styles.link}>{showFeeOverrides ? 'Hide' : 'Customize'} fee rates per method</Text>
      </Pressable>
      {showFeeOverrides && (
        <View style={{ marginTop: 10, gap: 14 }}>
          <Text style={styles.helperText}>
            Leave a field blank to use the default shown as its placeholder. This is what determines your net
            revenue for Venmo/PayPal/cash, and — when the fee is passed to the buyer — the actual amount charged
            for card/Cash App Pay.
          </Text>
          {ALL_METHODS.map((m) => {
            const def = feeRateFor(m);
            return (
              <View key={m} style={styles.feeRow}>
                <Text style={styles.feeRowLabel}>{METHOD_LABELS[m]}</Text>
                <View style={styles.feeRowInputs}>
                  <TextInput
                    style={styles.feeInput}
                    value={feeRateText[m]}
                    onChangeText={(t) => setFeeRateText((prev) => ({ ...prev, [m]: t }))}
                    placeholder={`${formatRatePercent(def.rate)}%`}
                    keyboardType="decimal-pad"
                    onSubmitEditing={handleSave}
                  />
                  <Text style={styles.feeRowPlus}>%  +  $</Text>
                  <TextInput
                    style={styles.feeInput}
                    value={feeFixedText[m]}
                    onChangeText={(t) => setFeeFixedText((prev) => ({ ...prev, [m]: t }))}
                    placeholder={def.fixed.toString()}
                    keyboardType="decimal-pad"
                    onSubmitEditing={handleSave}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pressable style={[styles.saveButton, submitting && styles.disabled]} disabled={submitting} onPress={handleSave}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  helperText: { fontSize: 13, color: '#666', marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusReady: { fontSize: 14, color: '#2a7a2a', fontWeight: '600' },
  link: { color: colors.primary, fontSize: 13, textDecorationLine: 'underline' },
  connectButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  balanceBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  balanceLabel: { fontSize: 12, color: '#666' },
  balanceValue: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 2 },
  balanceBreakdown: { fontSize: 12, color: '#888', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#eee', marginTop: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.chip },
  chipSelected: { backgroundColor: colors.primary },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontWeight: '600', color: colors.ink, fontSize: 13 },
  chipTextSelected: { color: '#fff' },
  label: { fontSize: 13, color: '#666', marginTop: 14, marginBottom: 6 },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  feeRowLabel: { fontSize: 14, color: colors.ink, width: 90 },
  feeRowInputs: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  feeRowPlus: { fontSize: 13, color: '#666' },
  feeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleLabel: { flex: 1, fontSize: 14, color: '#333' },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 28,
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
