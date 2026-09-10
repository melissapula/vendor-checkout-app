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
import { PaymentMethod } from '../types/database';
import { startStripeOnboarding, checkStripeAccountStatus } from '../lib/payments';
import { appAlert } from '../lib/alert';
import { useBreakpoint, centeredColumn, CONTENT_WIDTH } from '../lib/responsive';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Credit/debit card',
  venmo: 'Venmo',
  paypal: 'PayPal',
  cash_app: 'Cash App',
  cash: 'Cash',
};

// Methods in this order in the UI, matching how they'll appear at checkout.
const ALL_METHODS: PaymentMethod[] = ['card', 'venmo', 'paypal', 'cash_app', 'cash'];

export default function PaymentSettingsScreen() {
  const { store, updateStore, refreshStore } = useAuth();
  const [enabled, setEnabled] = useState<PaymentMethod[]>(store?.enabled_payment_methods ?? []);
  const [passFeeToBuyer, setPassFeeToBuyer] = useState(store?.pass_fee_to_buyer ?? false);
  const [venmoUsername, setVenmoUsername] = useState(store?.venmo_username ?? '');
  const [paypalUsername, setPaypalUsername] = useState(store?.paypal_me_username ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
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
  }

  async function handleConnectStripe() {
    if (Platform.OS !== 'web') {
      appAlert('Web only', 'Connect Stripe from the web app.');
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
      appAlert('Could not start Stripe setup', err instanceof Error ? err.message : 'Please try again.');
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

    setSubmitting(true);
    try {
      await updateStore({
        enabled_payment_methods: enabled,
        pass_fee_to_buyer: passFeeToBuyer,
        venmo_username: venmoUsername.trim() || null,
        paypal_me_username: paypalUsername.trim() || null,
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
        <View style={styles.statusRow}>
          <Text style={styles.statusReady}>✓ Connected — ready to accept cards and Cash App Pay</Text>
          <Pressable onPress={handleRefreshStatus} disabled={checkingStatus}>
            <Text style={styles.link}>{checkingStatus ? 'Checking…' : 'Refresh'}</Text>
          </Pressable>
        </View>
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
            placeholder="e.g. FourSeasonsStudio"
            autoCapitalize="none"
          />
        </>
      )}
      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Processing fees</Text>
      <Pressable style={styles.toggleRow} onPress={() => setPassFeeToBuyer((v) => !v)}>
        <View style={[styles.checkbox, passFeeToBuyer && styles.checkboxChecked]}>
          {passFeeToBuyer && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.toggleLabel}>Add the processing fee to the buyer's total (instead of it coming out of your payout)</Text>
      </Pressable>

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
  link: { color: '#1a1a1a', fontSize: 13, textDecorationLine: 'underline' },
  connectButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  divider: { height: 1, backgroundColor: '#eee', marginTop: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f0f0f0' },
  chipSelected: { backgroundColor: '#1a1a1a' },
  chipDisabled: { opacity: 0.4 },
  chipText: { fontWeight: '600', color: '#1a1a1a', fontSize: 13 },
  chipTextSelected: { color: '#fff' },
  label: { fontSize: 13, color: '#666', marginTop: 14, marginBottom: 6 },
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
  checkboxChecked: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleLabel: { flex: 1, fontSize: 14, color: '#333' },
  saveButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 28,
  },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
